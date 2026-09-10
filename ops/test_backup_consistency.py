import os
import pathlib
import subprocess
import tempfile
import unittest


class BackupConsistencyTests(unittest.TestCase):
    def test_replacement_with_same_size_and_mtime_and_deletion(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            live, copy = root / 'live', root / 'copy'
            live.mkdir()
            copy.mkdir()
            for directory in (live, copy):
                (directory / 'file').write_bytes(b'old bytes')
                os.utime(directory / 'file', (1000000000, 1000000000))
            (copy / 'deleted').write_text('no longer referenced')
            # Replacement arrives between the online pre-copy and quiescence.
            (live / 'file').write_bytes(b'new bytes')
            os.utime(live / 'file', (1000000000, 1000000000))
            subprocess.run(['rsync', '-a', '--checksum', '--delete', str(live) + '/', str(copy) + '/'], check=True)
            self.assertEqual((copy / 'file').read_bytes(), b'new bytes')
            self.assertFalse((copy / 'deleted').exists())
            manifest = subprocess.check_output(['sha256sum', 'file'], cwd=copy)
            (copy / 'manifest').write_bytes(manifest)
            (copy / 'file').write_bytes(b'bad bytes')
            result = subprocess.run(['sha256sum', '--check', '--quiet', 'manifest'], cwd=copy, capture_output=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
