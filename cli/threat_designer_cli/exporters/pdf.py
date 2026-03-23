"""PDF export matching the web app structure."""

from pathlib import Path


def export_pdf(model: dict, out_path: str) -> None:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        BaseDocTemplate, Frame, NextPageTemplate, PageBreak,
        PageTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    BLUE_HEADER = colors.HexColor("#428BCA")
    ALT_ROW     = colors.HexColor("#FAFAFA")
    GRID_COLOR  = colors.HexColor("#C8C8C8")

    # ── Page templates ────────────────────────────────────────────────────────
    margin = 1.4 * cm
    a4_w, a4_h = A4
    land_w, land_h = landscape(A4)

    portrait_frame  = Frame(margin, margin, a4_w - 2*margin, a4_h - 2*margin, id="portrait")
    landscape_frame = Frame(margin, margin, land_w - 2*margin, land_h - 2*margin, id="landscape")

    doc = BaseDocTemplate(
        out_path,
        pageTemplates=[
            PageTemplate("portrait",  frames=[portrait_frame],  pagesize=A4),
            PageTemplate("landscape", frames=[landscape_frame], pagesize=landscape(A4)),
        ],
    )

    # ── Styles ────────────────────────────────────────────────────────────────
    base      = getSampleStyleSheet()
    s_title   = ParagraphStyle("title",   fontSize=20, fontName="Helvetica-Bold",
                               alignment=1, spaceAfter=16)
    s_h1      = ParagraphStyle("h1",      fontSize=14, fontName="Helvetica-Bold",
                               spaceBefore=14, spaceAfter=6)
    s_body    = ParagraphStyle("body",    fontSize=10, fontName="Helvetica",
                               spaceAfter=6, leading=14)
    s_cell    = ParagraphStyle("cell",    fontSize=8,  fontName="Helvetica", leading=11)
    s_cell_sm = ParagraphStyle("cell_sm", fontSize=7,  fontName="Helvetica", leading=10)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _fmt_col(col: str) -> str:
        return " ".join(w.capitalize() for w in col.split("_"))

    def _table_style(n_rows: int) -> TableStyle:
        cmds = [
            ("BACKGROUND",    (0, 0), (-1, 0),  BLUE_HEADER),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, 0),  9),
            ("FONTSIZE",      (0, 1), (-1, -1), 8),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("GRID",          (0, 0), (-1, -1), 0.4, GRID_COLOR),
        ]
        for r in range(1, n_rows):
            if r % 2 == 0:
                cmds.append(("BACKGROUND", (0, r), (-1, r), ALT_ROW))
        return TableStyle(cmds)

    def _cell(val, style=None) -> Paragraph:
        s = style or s_cell
        if isinstance(val, list):
            val = "<br/>".join(f"• {v}" for v in val)
        return Paragraph(str(val or ""), s)

    def _add_table(story: list, heading: str, columns: list, rows: list,
                   col_widths=None, cell_style=None) -> None:
        if not rows:
            return
        story.append(Paragraph(heading, s_h1))
        header = [Paragraph(_fmt_col(c), ParagraphStyle(
            "hdr", fontSize=9, fontName="Helvetica-Bold", textColor=colors.white
        )) for c in columns]
        data = [header] + [
            [_cell(r.get(c, ""), cell_style) for c in columns]
            for r in rows
        ]
        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(_table_style(len(data)))
        story.append(t)
        story.append(Spacer(1, 0.4 * cm))

    # ── Extract data ──────────────────────────────────────────────────────────
    title       = model.get("title") or "Threat Model"
    description = model.get("description")
    assumptions = model.get("assumptions") or []
    assets      = (model.get("assets") or {}).get("assets", [])
    arch        = model.get("system_architecture") or {}
    data_flows  = arch.get("data_flows", [])
    trust_bnd   = arch.get("trust_boundaries", [])
    thr_src     = arch.get("threat_sources", [])
    threats     = (model.get("threat_list") or {}).get("threats", [])

    tw_p = a4_w - 2 * margin   # portrait text width
    tw_l = land_w - 2 * margin  # landscape text width

    story = []

    # ── Title ─────────────────────────────────────────────────────────────────
    story.append(Paragraph(title, s_title))
    story.append(Spacer(1, 0.2 * cm))

    meta = f"<b>ID:</b> {model.get('id', '—')}   <b>Created:</b> {(model.get('created_at') or '')[:10]}"
    story.append(Paragraph(meta, ParagraphStyle("meta", fontSize=8, fontName="Helvetica",
                                                 textColor=colors.HexColor("#666666"))))
    story.append(Spacer(1, 0.5 * cm))

    # ── Architecture Diagram ──────────────────────────────────────────────────
    image_path = model.get("image_path")
    if image_path:
        from pathlib import Path as _Path
        from reportlab.platypus import Image as RLImage
        p = _Path(image_path)
        if p.exists():
            story.append(Paragraph("Architecture Diagram", s_h1))
            max_w = tw_p
            max_h = 10 * cm
            img = RLImage(str(p), width=max_w, height=max_h, kind="proportional")
            story.append(img)
            story.append(Spacer(1, 0.4 * cm))

    # ── Portrait sections ─────────────────────────────────────────────────────
    if description:
        story.append(Paragraph("Description", s_h1))
        story.append(Paragraph(description, s_body))
        story.append(Spacer(1, 0.3 * cm))

    if assumptions:
        _add_table(story, "Assumptions", ["assumption"],
                   [{"assumption": a} for a in assumptions],
                   col_widths=[tw_p])

    _add_table(story, "Assets",
               ["type", "name", "description", "criticality"],
               assets,
               col_widths=[2.5*cm, 3.5*cm, tw_p - 9.5*cm, 2.5*cm])

    _add_table(story, "Data Flow",
               ["flow_description", "source_entity", "target_entity"],
               data_flows,
               col_widths=[tw_p - 7*cm, 3.5*cm, 3.5*cm])

    _add_table(story, "Trust Boundary",
               ["purpose", "source_entity", "target_entity"],
               trust_bnd,
               col_widths=[tw_p - 7*cm, 3.5*cm, 3.5*cm])

    _add_table(story, "Threat Source",
               ["category", "description", "example"],
               thr_src,
               col_widths=[3*cm, tw_p - 7.5*cm, 4.5*cm])

    # ── Threat Catalog (landscape) ────────────────────────────────────────────
    if threats:
        story.append(NextPageTemplate("landscape"))
        story.append(PageBreak())

        story.append(Paragraph("Threat Catalog", s_h1))

        cols = ["name", "stride_category", "description",
                "target", "impact", "likelihood", "mitigations"]
        col_widths = [4*cm, 3*cm, 6.5*cm, 3*cm, 2.5*cm, 2.5*cm, 5*cm]

        header = [Paragraph(_fmt_col(c), ParagraphStyle(
            "hdr_sm", fontSize=8, fontName="Helvetica-Bold", textColor=colors.white
        )) for c in cols]
        data = [header]
        for t in threats:
            mitigations = t.get("mitigations") or []
            if isinstance(mitigations, list):
                mit_val = "<br/>".join(f"• {m}" for m in mitigations)
            else:
                mit_val = str(mitigations)
            data.append([
                _cell(t.get("name", ""),            s_cell_sm),
                _cell(t.get("stride_category", ""), s_cell_sm),
                _cell(t.get("description", ""),     s_cell_sm),
                _cell(t.get("target", ""),          s_cell_sm),
                _cell(t.get("impact", ""),          s_cell_sm),
                _cell(t.get("likelihood", ""),      s_cell_sm),
                _cell(mit_val,                      s_cell_sm),
            ])

        tbl = Table(data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(_table_style(len(data)))
        story.append(tbl)

    doc.build(story)
