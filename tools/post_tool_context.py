import json
import sys


def main(document: dict) -> dict:
    result = document["tool_result"]
    if isinstance(result, str):
        result = json.loads(result)
    if not isinstance(result, dict):
        raise ValueError("tool_result must contain the summary object")
    missing = result["missingMethods"]
    if not isinstance(missing, list) or any(method not in ("card", "bank") for method in missing):
        raise ValueError("missingMethods must be an array of payment methods")
    return {
        "decision": "allow",
        "hookSpecificOutput": {
            "additionalContext": (
                f"Missing measured methods: {', '.join(missing) or 'none'}. "
                "This result summarizes caller-provided input, not independently verified recovery."
            )
        },
    }


if __name__ == "__main__":
    print(json.dumps(main(json.load(sys.stdin))))
