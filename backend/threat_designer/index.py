import boto3
import os
from agent import agent
import json
from utils import update_job_state, parse_s3_image_to_base64, fetch_results
from state import AssetsList, FlowsList, AgentState
from model import initialize_models
from datetime import datetime
import logging



logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
S3_BUCKET = os.environ.get("ARCHITECTURE_BUCKET")
AGENT_TABLE = os.environ.get("AGENT_STATE_TABLE")




def _initialize_state(event, job_id):
    state = AgentState()
    state["job_id"] = job_id
    state["iteration"] = event["iteration"]

    if event.get("replay", False):
        return _handle_replay_state(state, job_id)
    return _handle_new_state(state, event)


def _handle_replay_state(state, job_id):
    results = fetch_results(job_id, AGENT_TABLE)
    item = results["item"]

    state.update(
        {
            "replay": True,
            "assets": AssetsList(**item["assets"]),
            "system_architecture": FlowsList(**item["system_architecture"]),
            "retry": 0,
            "image_data": parse_s3_image_to_base64(S3_BUCKET, item["s3_location"]),
            "description": item["description"],
            "assumptions": item["assumptions"],
            "title": item["title"],
            "owner": item["owner"],
            "s3_location": item["s3_location"],
        }
    )
    return state


def _handle_new_state(state, event):
    state.update(
        {
            "image_data": parse_s3_image_to_base64(S3_BUCKET, event["s3_location"]),
            "description": event.get("description", " "),
            "assumptions": event.get("assumptions", []),
            "s3_location": event["s3_location"],
            "owner": event.get("owner", None),
            "title": event.get("title", None),
        }
    )
    return state



def lambda_handler(event, context):
    model_main, model_gap, model_struct = initialize_models(event.get("reasoning", False))

    config = {"configurable": {
        "model_main": model_main,
        "model_gap": model_gap,
        "model_struct": model_struct,
        "start_time": datetime.now(),
        "reasoning": event.get("reasoning", False),
    }}

    try:
        job_id = event["id"]
        state = _initialize_state(event, job_id)
        agent.invoke(state, config=config )

        return {
            "statusCode": 200,
            "body": json.dumps("Threat modeling completed successfully"),
        }
    except Exception as e:
        logger.error(e)
        update_job_state(job_id, "FAILED")
        return {
            "statusCode": 500,
            "body": json.dumps("Error processing threat modeling"),
        }
