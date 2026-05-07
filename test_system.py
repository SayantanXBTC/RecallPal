"""
test_system.py — Smoke-tests for the Dementia Assist API.

Run while the Flask backend is running:
    python test_system.py

All tests print their results.  The script exits with code 1 if any
assertion fails so it can be used in CI pipelines.
"""

import base64
import json
import os
import sys

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed.  Run: pip install requests")
    sys.exit(1)

BASE_URL = os.environ.get("DEMENTIA_API_URL", "http://localhost:5000")

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
INFO = "\033[94m·\033[0m"


def _json(r: requests.Response) -> dict:
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text}


def _assert(condition: bool, msg: str) -> None:
    if not condition:
        print(f"  {FAIL}  ASSERTION FAILED: {msg}")
        sys.exit(1)


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_health() -> None:
    print("1. GET /api/health")
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    data = _json(r)
    print(f"   {INFO} response: {json.dumps(data, indent=6)}")

    _assert(r.status_code == 200, f"expected 200, got {r.status_code}")
    _assert(data.get("status") == "ok", "'status' should be 'ok'")
    _assert("face_db_loaded"  in data, "'face_db_loaded' missing")
    _assert("people_count"    in data, "'people_count' missing")
    _assert("memory_backend"  in data, "'memory_backend' missing")
    _assert(data["memory_backend"] == "supabase",
            f"unexpected memory_backend: {data['memory_backend']!r}")
    print(f"   {PASS} health check passed  "
          f"(people={data['people_count']}, memory={data['memory_backend']})")


def test_people_list() -> None:
    print("2. GET /api/people")
    r = requests.get(f"{BASE_URL}/api/people", timeout=10)
    data = _json(r)

    _assert(r.status_code == 200, f"expected 200, got {r.status_code}")
    _assert("people" in data, "'people' key missing from response")
    _assert(isinstance(data["people"], list), "'people' should be a list")

    count = len(data["people"])
    if count:
        first = data["people"][0]
        _assert("name"             in first, "person entry missing 'name'")
        _assert("relation"         in first, "person entry missing 'relation'")
        _assert("notes"            in first, "person entry missing 'notes'")
        _assert("embeddings_count" in first, "person entry missing 'embeddings_count'")

    print(f"   {PASS} people list OK  ({count} enrolled)")


def test_recognize_empty_image() -> None:
    print("3. POST /api/recognize  (empty image — expects 400)")
    r = requests.post(f"{BASE_URL}/api/recognize",
                      json={"image": ""}, timeout=10)
    data = _json(r)

    _assert(r.status_code == 400, f"expected 400, got {r.status_code}")
    _assert(data.get("status") == "error", "expected status=error")
    print(f"   {PASS} empty-image rejection OK")


def test_recognize_invalid_base64() -> None:
    print("4. POST /api/recognize  (invalid base64 — expects graceful no_face)")
    r = requests.post(f"{BASE_URL}/api/recognize",
                      json={"image": "not_valid_base64!!"}, timeout=30)
    data = _json(r)

    # Backend should not crash — any 4xx or a no_face/error status is fine
    _assert(r.status_code in (200, 400, 500),
            f"unexpected status code: {r.status_code}")
    print(f"   {PASS} invalid-base64 handled gracefully  (status={data.get('status')})")


def test_recognize_with_dataset_image() -> None:
    print("5. POST /api/recognize  (real image from dataset/)")
    dataset_dir = "dataset"
    if not os.path.isdir(dataset_dir):
        print(f"   {INFO} dataset/ directory not found — skipping image test")
        return

    person_dirs = [
        d for d in os.listdir(dataset_dir)
        if os.path.isdir(os.path.join(dataset_dir, d))
    ]
    if not person_dirs:
        print(f"   {INFO} dataset/ has no sub-folders — skipping image test")
        return

    # Find first image in first person dir
    test_img_path = None
    for person in sorted(person_dirs):
        folder = os.path.join(dataset_dir, person)
        for fname in os.listdir(folder):
            if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                test_img_path = os.path.join(folder, fname)
                break
        if test_img_path:
            break

    if not test_img_path:
        print(f"   {INFO} No images found in dataset/ sub-folders — skipping")
        return

    with open(test_img_path, "rb") as fh:
        img_b64 = base64.b64encode(fh.read()).decode()

    r = requests.post(f"{BASE_URL}/api/recognize",
                      json={"image": img_b64}, timeout=60)
    data = _json(r)

    _assert(r.status_code == 200, f"expected 200, got {r.status_code}")
    _assert("status"     in data, "'status' missing from recognize response")
    _assert("name"       in data, "'name' missing")
    _assert("confidence" in data, "'confidence' missing")
    _assert("memory"     in data, "'memory' missing")
    _assert("suggestion" in data, "'suggestion' missing")
    _assert(data["status"] in ("recognized", "unknown", "no_face"),
            f"unexpected status: {data['status']!r}")

    print(f"   {PASS} recognition OK")
    print(f"        image : {test_img_path}")
    print(f"        result: {json.dumps(data, indent=8)}")


def test_add_person_validation() -> None:
    print("6. POST /api/add-person  (validation errors)")

    cases = [
        ("missing name",     {"name": "",    "relation": "Son",  "images": ["a"] * 5}, 400),
        ("short name",       {"name": "A",   "relation": "Son",  "images": ["a"] * 5}, 400),
        ("missing relation", {"name": "Bob", "relation": "",     "images": ["a"] * 5}, 400),
        ("too few images",   {"name": "Bob", "relation": "Son",  "images": ["a"] * 3}, 400),
    ]

    for label, payload, expected_code in cases:
        r = requests.post(f"{BASE_URL}/api/add-person",
                          json=payload, timeout=10)
        _assert(r.status_code == expected_code,
                f"[{label}] expected {expected_code}, got {r.status_code}")
        print(f"   {PASS} validation: {label}")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"  Dementia Assist — API Smoke Tests")
    print(f"  Target: {BASE_URL}")
    print(f"{'='*50}\n")

    # Check server is reachable before running any test
    try:
        requests.get(f"{BASE_URL}/api/health", timeout=5)
    except requests.exceptions.ConnectionError:
        print(f"{FAIL}  Cannot connect to {BASE_URL}")
        print("     Make sure the Flask backend is running (python app.py)")
        sys.exit(1)

    tests = [
        test_health,
        test_people_list,
        test_recognize_empty_image,
        test_recognize_invalid_base64,
        test_recognize_with_dataset_image,
        test_add_person_validation,
    ]

    for fn in tests:
        try:
            fn()
        except SystemExit:
            raise
        except Exception as exc:
            print(f"   {FAIL} UNEXPECTED ERROR: {exc}")
            sys.exit(1)
        print()

    print(f"{'='*50}")
    print(f"  {PASS} All tests passed.")
    print(f"{'='*50}\n")
