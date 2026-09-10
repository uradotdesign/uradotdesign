import datetime
import json
import pathlib
import tempfile
import unittest
from ura_monitor import REQUIRED_FLOWS, inspect_flows


class MonitorTests(unittest.TestCase):
    def test_delayed_inspection_required_ids_and_overlap_deduplication(self):
        with tempfile.TemporaryDirectory() as root:
            old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=7)
            cursor = pathlib.Path(root, 'inspection.json')
            cursor.write_text(json.dumps({'through': old.isoformat(), 'seen_errors': []}))
            queries = []
            def query(args):
                queries.append(args[-1])
                return json.dumps({'through': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'active': list(REQUIRED_FLOWS)[1:] + ['unrelated'], 'errors': [42]})
            result = inspect_flows(query, root)
            self.assertEqual(len(result), 2)
            self.assertIn('Publish scheduled content', result[0])
            self.assertIn((old - datetime.timedelta(minutes=5)).isoformat(), queries[0])
            self.assertEqual(len(inspect_flows(query, root)), 1)

    def test_failed_query_preserves_cursor(self):
        with tempfile.TemporaryDirectory() as root:
            cursor = pathlib.Path(root, 'inspection.json')
            initial = json.dumps({'through': datetime.datetime.now(datetime.timezone.utc).isoformat()})
            cursor.write_text(initial)
            def query(_):
                raise OSError('database unavailable')
            with self.assertRaises(OSError):
                inspect_flows(query, root)
            self.assertEqual(cursor.read_text(), initial)


if __name__ == '__main__':
    unittest.main()
