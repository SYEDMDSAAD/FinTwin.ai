"""'Hey FinTwin': transcription and the spoken answer, with Vertex stubbed out."""
import io
import wave

from fastapi.testclient import TestClient

import app as app_module
import voice.routes as routes
from chatbot.advisor import VOICE_MODE, _system_prompt
from voice.speech import MAX_SPOKEN_CHARS, VoiceError, clean_question, spoken_text, to_wav, transcribe

client = TestClient(app_module.app)
GOOD_KEY = {"x-internal-key": "test-internal-key"}


def test_spoken_text_drops_markdown_and_keeps_the_words():
    text = "**Your portfolio** is worth ₹1,70,734.\n\n- Best: Nifty 50 index fund\n- XIRR: 8.9% a year\n[Open](https://x.y)"
    assert spoken_text(text) == "Your portfolio is worth ₹1,70,734. Best: Nifty 50 index fund. XIRR: 8.9% a year. Open"


def test_a_long_answer_is_cut_at_a_sentence():
    text = " ".join(f"Sentence number {i} says something about money." for i in range(40))
    out = spoken_text(text)
    assert len(out) <= MAX_SPOKEN_CHARS and out.endswith(".")


def test_the_wake_word_is_not_part_of_the_question():
    assert clean_question('"Hey FinTwin, how are my portfolios?"') == "how are my portfolios?"
    assert clean_question("ok fin twin what did I spend on Swiggy") == "what did I spend on Swiggy"
    assert clean_question("  ") == ""


def test_odd_audio_is_refused_before_any_model_call():
    try:
        transcribe(b"x", "video/mp4")
        raise AssertionError("should refuse")
    except VoiceError as e:
        assert e.code == "bad_audio"
    assert transcribe(b"", "audio/webm;codecs=opus") == ""


def test_wav_wraps_pcm():
    w = wave.open(io.BytesIO(to_wav(b"\x00\x00" * 2400)))
    assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (1, 2, 24000, 2400)


def test_voice_mode_asks_for_short_spoken_answers_only_in_voice_mode():
    assert "READ ALOUD" in _system_prompt(VOICE_MODE, "data", "")
    assert "READ ALOUD" not in _system_prompt("Savings Advisor", "data", "")


def test_routes_need_the_key_and_pass_through(monkeypatch):
    monkeypatch.setattr(routes, "transcribe", lambda data, mime: "how is my portfolio doing?")
    monkeypatch.setattr(routes, "speak", lambda text: b"RIFF-fake")
    files = {"audio": ("q.webm", b"opus", "audio/webm")}
    assert client.post("/voice/transcribe", files=files).status_code == 403
    r = client.post("/voice/transcribe", files=files, headers=GOOD_KEY)
    assert r.status_code == 200 and r.json() == {"text": "how is my portfolio doing?"}
    r = client.post("/voice/speak", json={"text": "Hello"}, headers=GOOD_KEY)
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.content == b"RIFF-fake"


def test_route_errors_carry_a_code(monkeypatch):
    def unavailable(text):
        raise VoiceError("voice_unavailable", "The voice is unavailable.")
    monkeypatch.setattr(routes, "speak", unavailable)
    r = client.post("/voice/speak", json={"text": "Hello"}, headers=GOOD_KEY)
    assert r.status_code == 503 and r.json()["detail"]["code"] == "voice_unavailable"
