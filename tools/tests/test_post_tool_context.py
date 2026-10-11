import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("post_tool_context",
    Path(__file__).resolve().parents[1] / "post_tool_context.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PostToolContextTests(unittest.TestCase):
    def test_object_and_serialized_results(self):
        for result in [{"missingMethods": ["bank"]}, '{"missingMethods":["bank"]}']:
            output = module.main({"tool_result": result})
            self.assertEqual(output["decision"], "allow")
            self.assertIn("bank", output["hookSpecificOutput"]["additionalContext"])
            json.dumps(output)

    def test_complete_input_is_not_independent_recovery(self):
        output = module.main({"tool_result": {"missingMethods": []}})
        self.assertIn("not independently", output["hookSpecificOutput"]["additionalContext"])

    def test_missing_and_invalid_results_are_errors(self):
        for document in [{}, {"tool_result": []}, {"tool_result": {}},
                         {"tool_result": {"missingMethods": ["crypto"]}}]:
            with self.subTest(document=document):
                with self.assertRaises((KeyError, ValueError)):
                    module.main(document)
