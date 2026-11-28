import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field

from voice.speech import MAX_AUDIO_BYTES, VoiceError, speak, transcribe

logger = logging.getLogger(__name__)
router = APIRouter()


def _status(e: VoiceError) -> int:
    return 503 if e.code == "voice_unavailable" else 413 if e.code == "too_long" else 422


@router.post("/voice/transcribe")
async def transcribe_question(audio: UploadFile = File(...)):
    """The spoken question as text. The recording is neither stored nor logged."""
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    try:
        return {"text": await run_in_threadpool(transcribe, data, audio.content_type)}
    except VoiceError as e:
        raise HTTPException(status_code=_status(e), detail={"code": e.code, "message": e.message})
    except Exception as e:
        logger.warning("Transcription failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail={"code": "voice_unavailable",
                                                     "message": "Couldn't hear that just now. Try again, or type it."})


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


@router.post("/voice/speak")
async def speak_answer(body: SpeakRequest):
    """The answer in FinTwin's voice (audio/wav)."""
    try:
        wav = await run_in_threadpool(speak, body.text)
    except VoiceError as e:
        raise HTTPException(status_code=_status(e), detail={"code": e.code, "message": e.message})
    except Exception as e:
        logger.warning("Speech failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail={"code": "voice_unavailable",
                                                     "message": "The voice is unavailable. The answer is on screen."})
    return Response(content=wav, media_type="audio/wav")
