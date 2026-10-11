import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "summarize_payments", Path(__file__).resolve().parents[1] / "summarize_payments.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
main = module.main


class PaymentSummaryTests(unittest.TestCase):
    def test_healthy_and_json_serializable(self):
        result = main(json.dumps([
            {"method": "card", "durationMs": 100, "status": 200},
            {"method": "bank", "durationMs": 80, "status": 200},
        ]))
        self.assertTrue(result["recovered"])
        self.assertEqual(result["methods"]["card"]["p95Ms"], 100)
        json.dumps(result, allow_nan=False)

    def test_exact_recovery_threshold(self):
        for duration, recovered in [(1000, True), (1000.1, False)]:
            with self.subTest(duration=duration):
                result = main(json.dumps([
                    {"method": "card", "durationMs": duration, "status": 200},
                    {"method": "bank", "durationMs": 20, "status": 200},
                ]))
                self.assertEqual(result["recovered"], recovered)

    def test_missing_method_is_not_success(self):
        result = main('[{"method":"card","durationMs":20,"status":200}]')
        self.assertFalse(result["recovered"])
        self.assertEqual(result["missingMethods"], ["bank"])
        self.assertIsNone(result["methods"]["bank"]["p95Ms"])

    def test_failure_and_nearest_rank(self):
        samples = [{"method": "card", "durationMs": i, "status": 200} for i in range(1, 21)]
        samples.append({"method": "bank", "durationMs": 20, "status": 500})
        result = main(json.dumps(samples))
        self.assertEqual(result["methods"]["card"]["p95Ms"], 19)
        self.assertFalse(result["recovered"])
        self.assertEqual(result["methods"]["bank"]["failureRate"], 1)

    def test_invalid_measurements_are_explicit_errors(self):
        invalid = [
            "invalid-json", "[]", "{}", "[null]",
            '[{"method":"card","durationMs":true,"status":200}]',
            '[{"method":"card","durationMs":-1,"status":200}]',
            '[{"method":"card","durationMs":NaN,"status":200}]',
            '[{"method":"crypto","durationMs":20,"status":200}]',
            '[{"method":"card","durationMs":20,"status":true}]',
            '[{"method":"card","durationMs":20,"status":999}]',
            '[{"method":[],"durationMs":20,"status":200}]',
        ]
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    main(value)


if __name__ == "__main__":
    unittest.main()
