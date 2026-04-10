"""
Public pilot / contact form — sends email via Resend (no auth).
"""
import html
import logging

import resend
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.contact import ContactRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/contact", status_code=204)
def submit_contact(body: ContactRequest) -> None:
    if not settings.RESEND_API_KEY:
        logger.error("RESEND_API_KEY is not set")
        raise HTTPException(
            status_code=503,
            detail="Contact form is temporarily unavailable.",
        )

    resend.api_key = settings.RESEND_API_KEY

    name = body.full_name.strip()
    subj_raw = body.subject.strip() if body.subject else ""
    subject = subj_raw or f"New message from {name}"
    # Avoid header injection in subject
    subject = subject.replace("\r", " ").replace("\n", " ")[:998]

    safe_name = html.escape(name)
    safe_email = html.escape(str(body.email))
    safe_subject_line = html.escape(subj_raw) if subj_raw else ""
    safe_message = html.escape(body.message.strip()).replace("\n", "<br/>")

    subject_block = (
        f"<p><strong>Subject:</strong> {safe_subject_line}</p>\n  " if subj_raw else ""
    )
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p><strong>Name:</strong> {safe_name}</p>
  <p><strong>Email:</strong> <a href="mailto:{safe_email}">{safe_email}</a></p>
  {subject_block}<p><strong>Message:</strong></p>
  <p style="margin-top: 0.5rem;">{safe_message}</p>
</body>
</html>"""

    params: resend.Emails.SendParams = {
        "from": "Contact Form <noreply@mail.surface.best>",
        "to": ["team@mail.surface.best"],
        "reply_to": str(body.email),
        "subject": subject,
        "html": html_body,
    }

    try:
        resend.Emails.send(params)
    except Exception as e:
        logger.exception("Resend send failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Unable to send your message. Please try again later.",
        ) from e
