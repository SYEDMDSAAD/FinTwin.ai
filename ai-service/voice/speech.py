"""
"Hey FinTwin": the question heard after the wake word, and the answer spoken back.

The wake word itself is spotted on the device (Porcupine); until it is heard
no audio leaves the phone. What comes here is the few seconds after it:

- transcribe(): the recording to text, by Gemini on Vertex AI (the fast
  model, no thinking: ~2 s). Real voices are real data, so Vertex only; the
  audio is not stored or logged.
- speak(): the answer to a warm female voice (Gemini TTS, voice Sulafat by
  default), returned as a WAV. The text was already masked by the backend
  (PiiRedactor) and is cut to a few sentences here.

Configuration: VOICE_STT_MODEL (default the fast Gemini model),
VOICE_TTS_MODEL (gemini-2.5-flash-lite-preview-tts, falling back to gemini-2.5-flash-tts), VOICE_NAME (Sulafat).
"""
import io
import os
import re
import wave

MAX_AUDIO_BYTES = 2 * 1024 * 1024      # ~15 s of compressed speech, with room to spare
MAX_SPOKEN_CHARS = 600                 # a few sentences: the screen shows the rest

AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/mpeg", "audio/aac"}

# The lite voice model makes a sentence in ~4 s, the full one in ~9 s; the
# full one is the fallback if the lite (preview) model is refused or retired.
TTS_MODEL = os.environ.get("VOICE_TTS_MODEL", "gemini-2.5-flash-lite-preview-tts")
TTS_FALLBACK = "gemini-2.5-flash-tts"
VOICE_NAME = os.environ.get("VOICE_NAME", "Sulafat")
_SAMPLE_RATE = 24000

_TRANSCRIBE_PROMPT = (
    "Someone is asking their personal-finance app, FinTwin, a question about their own money: "
    "portfolio, mutual funds, SIPs, stocks, spending, budgets, goals, net worth, bills. "
    "Indian English or Hinglish; Indian brands and terms (Swiggy, Zomato, UPI, SIP, XIRR, Nifty, PPF, EMI) "
    "are common. Write down the question as they meant it, Hindi words in Latin script, fixing obvious "
    "mishearings and grammar slips. Output only the question. If there is no speech, output nothing."
)

_STYLE = "Say this in a warm, sweet, friendly voice with a soft Indian English accent, at a natural conversational pace:"


class VoiceError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _gemini():
    if os.environ.get("LLM_PROVIDER", "gemini").strip().lower() != "gemini":
        raise VoiceError("voice_unavailable", "Voice needs Gemini on Vertex AI.")
    from utils import gemini_client
    return gemini_client


def _base_type(mime: str | None) -> str:
    return (mime or "").split(";")[0].strip().lower()


def transcribe(audio: bytes, mime: str | None) -> str:
    """The spoken question as text ("" when nothing was said)."""
    kind = _base_type(mime)
    if kind not in AUDIO_TYPES:
        raise VoiceError("bad_audio", "That recording format isn't supported.")
    if not audio:
        return ""
    if len(audio) > MAX_AUDIO_BYTES:
        raise VoiceError("too_long", "That was a long one. Ask a shorter question.")
    g = _gemini()
    from google.genai import types
    model = os.environ.get("VOICE_STT_MODEL", g.FAST_MODEL)
    config = g._config(model, 200, 20.0, temperature=0)
    response = g._generate(model, "voice_transcribe", 20.0,
                           [types.Part.from_bytes(data=audio, mime_type=kind), _TRANSCRIBE_PROMPT], config)
    return clean_question(response.text or "")


def clean_question(text: str) -> str:
    text = text.strip().strip('"').strip()
    # The model sometimes keeps the wake word when the user says it twice
    text = re.sub(r"^(hey|hi|ok|okay)[ ,]+fin ?twin[ ,.!?]*", "", text, flags=re.I).strip()
    return text[:300]


def spoken_text(text: str) -> str:
    """What is read aloud: the answer without markdown, cut at a sentence near MAX_SPOKEN_CHARS."""
    t = re.sub(r"```.*?```", " ", text or "", flags=re.S)
    t = re.sub(r"^\s*#+\s*", "", t, flags=re.M)                  # headings
    t = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s+", "", t, flags=re.M)   # list markers
    t = re.sub(r"[*_`>|]", "", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)               # links → their text
    t = re.sub(r"\s*\n+\s*", ". ", t)
    t = re.sub(r"\.(\s*\.)+", ".", t)
    t = re.sub(r"[ \t]+", " ", t).strip()
    if len(t) <= MAX_SPOKEN_CHARS:
        return t
    cut = t[:MAX_SPOKEN_CHARS]
    end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    return (cut[:end + 1] if end > 200 else cut.rsplit(" ", 1)[0] + "…").strip()


def speak(text: str) -> bytes:
    """The answer in FinTwin's voice, as a 24 kHz mono WAV."""
    words = spoken_text(text)
    if not words:
        raise VoiceError("nothing_to_say", "There's nothing to read out.")
    g = _gemini()
    from google.genai import types
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE_NAME))),
        http_options=types.HttpOptions(timeout=30_000, retry_options=g._vertex_retry()),
    )
    try:
        response = g._generate(TTS_MODEL, "voice_speak", 30.0, f"{_STYLE} {words}", config)
    except RuntimeError:
        if TTS_MODEL == TTS_FALLBACK:
            raise
        response = g._generate(TTS_FALLBACK, "voice_speak", 30.0, f"{_STYLE} {words}", config)
    try:
        pcm = response.candidates[0].content.parts[0].inline_data.data
    except (AttributeError, IndexError, TypeError):
        raise VoiceError("voice_unavailable", "The voice didn't answer. The text is on screen.")
    return to_wav(pcm)


def to_wav(pcm: bytes, rate: int = _SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()
