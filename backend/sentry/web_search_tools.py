"""
AgentCore Web Search Tool Module

Provides a `web_search` tool backed by Bedrock AgentCore's built-in web search
connector, as an alternative to Tavily. Selected at deploy time via
WEB_SEARCH_PROVIDER; see infra/web_search.tf.

**Why an MCP client and not an API call.** Web Search on Bedrock AgentCore is
exposed exclusively as a built-in *connector target* on an AgentCore **Gateway**,
which speaks MCP over streamable HTTP — there is no direct data-plane search
call. So this module is a small MCP client:

    initialize -> Mcp-Session-Id -> tools/call {name, arguments}

signed with SigV4 (the gateway's inbound authorizer is AWS_IAM, service
`bedrock-agentcore`) using the runtime's own execution-role credentials. The
JSON-RPC is hand-rolled rather than pulling in the async `mcp` SDK: the protocol
surface needed is two POSTs, and LangChain tools here are synchronous, so an
async client would need an event-loop bridge inside the running graph loop.
botocore — already a dependency via boto3 — supplies both the signer and the
HTTP session, so this adds no new package.

**No fetch/extract counterpart.** The connector offers search only. Unlike
Tavily (search + extract) there is no way to pull full page content, so when
this provider is selected the agent gets a single tool and the prompts drop
their fetch guidance. Snippets are all the agent sees.

**Region.** The connector is offered in us-east-1, eu-west-1, and
ap-northeast-1 only, so the gateway may live in a different region than the rest
of the deployment (WEB_SEARCH_REGION). The query never leaves AWS — the gateway
serves it internally — but it can leave the deployment's region.

**Deliberately no server-side filters.** Connector 1.2.0 added an optional
`filters` object (domain / published-date). Using it requires pinning the
gateway target to a connector version, which is not expressible declaratively
(the CloudFormation registry's ConnectorSource carries only ConnectorId), and a
pre-1.2.0 target *silently ignores* an unknown `filters` argument rather than
rejecting it. Rather than advertise arguments that might quietly not apply, this
implementation stays on the base surface (query + maxResults) and the tool
description tells the model to put the period in the query text instead.
"""

import datetime
import json
import logging
import os
import re
import threading
from typing import Any, Callable, List, NamedTuple

logger = logging.getLogger(__name__)

# The connector's own limits (Web Search Tool input schema). Enforced
# client-side so a too-long query comes back as actionable tool feedback
# instead of a gateway 400 the model can't interpret.
QUERY_MAX_CHARS = 200
RESULTS_MAX = 25

# The MCP protocol revision the gateway examples use.
_MCP_PROTOCOL_VERSION = "2025-06-18"

# AgentCore Gateway prefixes every tool with its target name, joined by THREE
# underscores, e.g. `td-sentry-web-search___WebSearch`. Terraform passes the
# composed name in env; when absent it is discovered from tools/list rather
# than guessed.
_WEB_SEARCH_TOOL_SUFFIX = "websearch"

TOOL_NAME = "web_search"


class HttpResponse(NamedTuple):
    """The minimal HTTP response shape this client needs (fakeable in tests)."""

    status: int
    headers: dict
    text: str


# transport(body, headers) -> HttpResponse
Transport = Callable[[str, dict], HttpResponse]


class WebSearchError(RuntimeError):
    """A gateway/protocol failure — surfaced to the model as tool feedback."""


def _header(headers: Any, name: str):
    """Case-insensitive header lookup that works on dicts and botocore headers."""
    if not headers:
        return None
    getter = getattr(headers, "get", None)
    if getter is not None:
        direct = getter(name)
        if direct:
            return direct
    lowered = name.lower()
    try:
        items = headers.items()
    except AttributeError:
        return None
    for key, value in items:
        if str(key).lower() == lowered:
            return value
    return None


def _parse_jsonrpc_body(resp: HttpResponse) -> dict:
    """Decode a JSON-RPC body, whether it came back as JSON or SSE.

    Streamable-HTTP MCP servers may answer a POST with either application/json
    or a text/event-stream carrying the same JSON in `data:` lines, and the
    gateway picks based on the request's Accept header. Both are accepted so a
    server-side change of mind can't break the tool.
    """
    body = resp.text or ""
    ctype = (_header(resp.headers, "Content-Type") or "").lower()
    if "text/event-stream" in ctype or body.lstrip().startswith("event:"):
        for line in body.splitlines():
            if not line.startswith("data:"):
                continue
            chunk = line[5:].strip()
            if not chunk:
                continue
            try:
                parsed = json.loads(chunk)
            except ValueError:
                continue
            # Skip server-initiated notifications; we want the reply to our call.
            if isinstance(parsed, dict) and ("result" in parsed or "error" in parsed):
                return parsed
        raise WebSearchError("gateway returned an event stream with no JSON-RPC result")
    try:
        return json.loads(body)
    except ValueError as e:
        raise WebSearchError(f"gateway returned a non-JSON body: {body[:200]!r}") from e


def _sigv4_transport(url: str, region: str, timeout_s: float) -> Transport:
    """Build the live transport: SigV4-signed POSTs over botocore's HTTP session.

    Credentials are resolved (and frozen) per request so the container's rotating
    role credentials keep working across a long-lived runtime session.
    """
    import boto3
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.httpsession import URLLib3Session

    boto_session = boto3.Session()
    http = URLLib3Session(timeout=timeout_s)

    def send(body: str, headers: dict) -> HttpResponse:
        creds = boto_session.get_credentials()
        if creds is None:
            raise WebSearchError(
                "no AWS credentials available to sign the gateway call"
            )
        request = AWSRequest(method="POST", url=url, data=body, headers=dict(headers))
        SigV4Auth(
            creds.get_frozen_credentials(), "bedrock-agentcore", region
        ).add_auth(request)
        resp = http.send(request.prepare())
        text = (
            resp.text
            if isinstance(resp.text, str)
            else (resp.content or b"").decode("utf-8", "replace")
        )
        return HttpResponse(status=resp.status_code, headers=resp.headers, text=text)

    return send


def normalize_gateway_url(url: str) -> str:
    """Return the gateway's MCP endpoint (Terraform's URL may omit /mcp)."""
    trimmed = (url or "").strip().rstrip("/")
    if not trimmed:
        return ""
    return trimmed if trimmed.endswith("/mcp") else f"{trimmed}/mcp"


_MONTHS = {
    name: number
    for number, name in enumerate(
        "january february march april may june july august "
        "september october november december".split(),
        start=1,
    )
}


def parse_published_date(value: Any):
    """Best-effort publishedDate -> date (the connector's format is unpinned).

    Results carry ISO dates and full timestamps, but also prose
    ("05:00PM, Sunday, October 06 2024, PDT"); anything unreadable counts as
    UNDATED rather than silently mapping to today.
    """
    if not isinstance(value, str):
        return None
    iso = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", value)
    if iso:
        parts = (int(iso[1]), int(iso[2]), int(iso[3]))
    else:
        prose = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", value)
        if not prose or prose[1].lower() not in _MONTHS:
            return None
        parts = (int(prose[3]), _MONTHS[prose[1].lower()], int(prose[2]))
    try:
        return datetime.date(*parts)
    except ValueError:
        return None


class WebSearchGateway:
    """MCP client for the gateway's `WebSearch` connector tool.

    The MCP session id is cached on the instance (one initialize per process
    rather than per search) and re-established transparently when the gateway
    expires it. `transport` is injectable so tests exercise the protocol
    without AWS.
    """

    def __init__(
        self,
        gateway_url: str,
        region: str = "us-east-1",
        tool_name: str = "",
        default_max_results: int = 5,
        timeout_s: float = 20.0,
        transport=None,
        today=None,
    ) -> None:
        self.url = normalize_gateway_url(gateway_url)
        if not self.url:
            raise ValueError("gateway_url is required")
        self.region = region
        self.default_max_results = max(1, min(RESULTS_MAX, default_max_results))
        self._tool_name = (tool_name or "").strip()
        self._transport = transport or _sigv4_transport(self.url, region, timeout_s)
        self._today = today or (
            lambda: datetime.datetime.now(datetime.timezone.utc).date()
        )
        self._session_id = None
        self._next_id = 0
        # One MCP session is shared by every caller, and LangGraph runs sync
        # tools on a thread pool, so concurrent searches would otherwise race:
        # one thread clearing _session_id to re-handshake while another POSTs
        # with the id it just replaced, and both handing out the same _next_id.
        # Re-entrant because search() -> _resolve_tool_name() -> _rpc().
        self._lock = threading.RLock()

    # --- MCP plumbing --------------------------------------------------------

    def _post(self, payload: dict, session_id) -> HttpResponse:
        headers = {
            "Content-Type": "application/json",
            # The MCP streamable-HTTP transport requires the client to accept
            # both; the gateway may answer either way.
            "Accept": "application/json, text/event-stream",
        }
        if session_id:
            headers["Mcp-Session-Id"] = session_id
        return self._transport(json.dumps(payload), headers)

    def _rpc(self, method: str, params: dict, retry_session: bool = True) -> dict:
        """One JSON-RPC call, (re-)initializing the session as needed.

        Serialized on the instance lock: the session id and request counter are
        shared, so overlapping calls have to take turns.
        """
        with self._lock:
            return self._rpc_locked(method, params, retry_session)

    def _rpc_locked(self, method: str, params: dict, retry_session: bool) -> dict:
        if self._session_id is None:
            self._initialize()
        self._next_id += 1
        resp = self._post(
            {
                "jsonrpc": "2.0",
                "id": f"sentry-{self._next_id}",
                "method": method,
                "params": params,
            },
            self._session_id,
        )
        # A dropped/expired session shows up as a 4xx on an otherwise valid
        # call; re-handshake once before treating it as a real failure.
        if resp.status in (400, 404) and retry_session:
            logger.info(
                f"web_search session rejected ({resp.status}) - re-initializing"
            )
            self._session_id = None
            return self._rpc_locked(method, params, retry_session=False)
        if resp.status >= 300:
            raise WebSearchError(
                f"gateway {method} failed with HTTP {resp.status}: "
                f"{(resp.text or '')[:300]}"
            )
        body = _parse_jsonrpc_body(resp)
        if isinstance(body.get("error"), dict):
            err = body["error"]
            raise WebSearchError(
                f"gateway {method} error {err.get('code')}: {err.get('message')}"
            )
        result = body.get("result")
        if not isinstance(result, dict):
            raise WebSearchError(f"gateway {method} returned no result object")
        return result

    def _initialize(self) -> None:
        resp = self._post(
            {
                "jsonrpc": "2.0",
                "id": "sentry-init",
                "method": "initialize",
                "params": {
                    "protocolVersion": _MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "threat-designer-sentry", "version": "1.0.0"},
                },
            },
            None,
        )
        if resp.status >= 300:
            raise WebSearchError(
                f"gateway initialize failed with HTTP {resp.status}: "
                f"{(resp.text or '')[:300]}"
            )
        _parse_jsonrpc_body(resp)  # surfaces a JSON-RPC error as WebSearchError
        # A stateless gateway may not vend a session id at all; carry on
        # without one rather than failing (it is only echoed back when present).
        self._session_id = _header(resp.headers, "Mcp-Session-Id") or ""

    def _resolve_tool_name(self) -> str:
        """The gateway-side tool name, from config or discovered via tools/list."""
        with self._lock:
            return self._resolve_tool_name_locked()

    def _resolve_tool_name_locked(self) -> str:
        if self._tool_name:
            return self._tool_name
        result = self._rpc("tools/list", {})
        names = [
            t.get("name")
            for t in (result.get("tools") or [])
            if isinstance(t, dict) and t.get("name")
        ]
        for name in names:
            # `<target>___WebSearch` — match on the suffix so the target name
            # is free to change without a code change.
            if str(name).lower().replace("_", "").endswith(_WEB_SEARCH_TOOL_SUFFIX):
                self._tool_name = str(name)
                return self._tool_name
        raise WebSearchError(
            "no WebSearch tool on the gateway (tools/list returned: "
            f"{', '.join(str(n) for n in names) or 'nothing'})"
        )

    # --- the search itself ---------------------------------------------------

    def search(self, query: str, max_results=None) -> dict:
        """Run one web search; return normalized results.

        Raises ValueError for bad arguments (the tool turns those into
        actionable feedback) and WebSearchError for gateway failures.
        """
        cleaned = (query or "").strip()
        if not cleaned:
            raise ValueError("query must not be empty")
        if len(cleaned) > QUERY_MAX_CHARS:
            raise ValueError(
                f"query must be {QUERY_MAX_CHARS} characters or fewer "
                f"(got {len(cleaned)}) — search for the key terms, not a sentence"
            )
        wanted = max_results or self.default_max_results
        if wanted < 1:
            raise ValueError("max_results must be at least 1")
        wanted = min(RESULTS_MAX, wanted)

        # Held across both calls so the resolved tool name and the call that uses
        # it see the same session.
        with self._lock:
            result = self._rpc(
                "tools/call",
                {
                    "name": self._resolve_tool_name(),
                    "arguments": {"query": cleaned, "maxResults": wanted},
                },
            )
        if result.get("isError"):
            raise WebSearchError(f"web search failed: {_result_text(result)[:300]}")

        results = []
        for item in _extract_results(result):
            published = parse_published_date(item.get("publishedDate"))
            results.append(
                {
                    "title": item.get("title") or "",
                    "url": item.get("url") or "",
                    # Normalized to ISO (or None) so the UI and the model read
                    # one shape whatever format the connector used.
                    "published_date": published.isoformat() if published else None,
                    "text": item.get("text") or "",
                }
            )
        return {
            "query": cleaned,
            "as_of": self._today().isoformat(),
            "result_count": len(results),
            "results": results,
        }


def _result_text(result: dict) -> str:
    """Concatenate the text parts of an MCP tool result's content blocks."""
    parts = []
    for block in result.get("content") or []:
        if isinstance(block, dict) and isinstance(block.get("text"), str):
            parts.append(block["text"])
    return "\n".join(parts)


def _extract_results(result: dict) -> List[dict]:
    """Pull the result list out of an MCP tool result.

    The connector answers with the search payload JSON-encoded inside a text
    content block and, per the MCP spec, may ALSO provide it pre-parsed as
    `structuredContent`. Prefer the structured form when present.
    """
    structured = result.get("structuredContent")
    if isinstance(structured, dict) and isinstance(structured.get("results"), list):
        return [r for r in structured["results"] if isinstance(r, dict)]
    text = _result_text(result).strip()
    if not text:
        return []
    try:
        decoded = json.loads(text)
    except ValueError as e:
        raise WebSearchError(
            f"could not decode search results: {text[:200]!r}"
        ) from e
    if isinstance(decoded, dict) and isinstance(decoded.get("results"), list):
        return [r for r in decoded["results"] if isinstance(r, dict)]
    if isinstance(decoded, list):
        return [r for r in decoded if isinstance(r, dict)]
    return []


# The description the model sees. It deliberately carries NO date: a tool's
# description is built once per container and an AgentCore container serves
# sessions for hours or days, so a stamp baked in here goes stale and tells the
# model the wrong "now". prompt.system_prompt() interpolates current_date on
# every request, which is the date the model should reason from; the reminder
# below to put the period in the query text is what makes that date usable here.
_DESCRIPTION = (
    "Search the public web and return ranked results (title, url, publication "
    "date, and a relevant text snippet).\n"
    "Use this for security context that lives outside the threat model: current "
    "CVEs and advisories, active exploit campaigns, new attack techniques, or a "
    "fact published after your training cutoff. Do not use it for what a threat, "
    "asset, or data flow in this threat model MEANS — that is in the model "
    "itself.\n"
    "Args: `query` is a short keyword phrase, {max_chars} characters or fewer "
    "(not a sentence). `max_results` is 1-{results_max} (default {default}).\n"
    "Results are ranked by RELEVANCE, not date, and there is no date filter — "
    "when the question concerns a specific period, put the period in the query "
    'itself ("Log4Shell exploitation 2026") and check each result\'s publication '
    "date before treating it as evidence for that period.\n"
    "This tool returns SNIPPETS only — there is no way to fetch full page "
    "content, so do not promise the user a deeper read of a page. Treat snippets "
    "as claims by their source, not as facts: say who reported what."
)


def make_web_search_tool(engine: WebSearchGateway):
    """Wrap a WebSearchGateway as the LangChain `web_search` tool."""
    from langchain_core.tools import StructuredTool

    description = _DESCRIPTION.format(
        max_chars=QUERY_MAX_CHARS,
        results_max=RESULTS_MAX,
        default=engine.default_max_results,
    )

    def web_search(query: str, max_results: int = 0):
        # A failure comes back as the tool's RESULT so the model can react
        # (rephrase, or tell the user the lookup failed) instead of aborting.
        try:
            return engine.search(query, max_results=max_results or None)
        except ValueError as e:  # bad arguments — concise + actionable
            return f"Error: {e}"
        except Exception as e:  # noqa: BLE001 - a tool error is feedback
            logger.warning("web_search failed", exc_info=True)
            return f"Error: web_search failed: {type(e).__name__}: {e}"

    return StructuredTool.from_function(
        func=web_search, name=TOOL_NAME, description=description
    )


def get_agentcore_web_search_tools() -> List:
    """Return `[web_search]` when the AgentCore gateway is configured, else `[]`.

    Both a gateway URL and a region are required: without the URL the runtime
    has nothing to call, and the execution role carries no InvokeGateway grant
    unless the deployment provisioned the gateway, so offering the tool would
    only produce 403s the model can't act on.
    """
    url = os.environ.get("WEB_SEARCH_GATEWAY_URL", "")
    if not url.strip():
        logger.warning(
            "WEB_SEARCH_PROVIDER is agentcore but WEB_SEARCH_GATEWAY_URL is "
            "empty - web_search will not be available"
        )
        return []
    try:
        engine = WebSearchGateway(
            gateway_url=url,
            region=os.environ.get("WEB_SEARCH_REGION", "us-east-1"),
            tool_name=os.environ.get("WEB_SEARCH_TOOL_NAME", ""),
            default_max_results=int(os.environ.get("WEB_SEARCH_MAX_RESULTS", "5")),
        )
        return [make_web_search_tool(engine)]
    except Exception:  # noqa: BLE001 - a misconfigured gateway must not break Sentry
        logger.warning(
            "could not build the AgentCore web search client - web_search off",
            exc_info=True,
        )
        return []
