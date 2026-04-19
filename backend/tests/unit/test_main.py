"""Tests for main.py — lifespan startup behaviour."""
import pytest
from unittest.mock import MagicMock, patch
from contextlib import asynccontextmanager

pytestmark = pytest.mark.unit


class TestLifespan:
    def test_lifespan_starts_owlv2_preload_thread(self):
        """On startup the lifespan must launch a daemon thread that calls preload_owlv2."""
        started_threads = []

        class _FakeThread:
            def __init__(self, target, daemon):
                self.target = target
                self.daemon = daemon

            def start(self):
                started_threads.append(self)

        with (
            patch("main.run_seed_minio_only"),
            patch("main.threading.Thread", side_effect=_FakeThread),
            patch("main.preload_owlv2") as mock_preload,
        ):
            import main as app_main
            import asyncio

            async def _run():
                async with app_main.lifespan(app_main.app):
                    pass

            asyncio.run(_run())

        assert len(started_threads) == 1
        assert started_threads[0].daemon is True
        assert started_threads[0].target is mock_preload

    def test_lifespan_runs_seed_before_preload(self):
        """MinIO seed must complete before the OWLv2 thread is started."""
        call_order = []

        def _seed():
            call_order.append("seed")

        class _FakeThread:
            def __init__(self, target, daemon):
                self.target = target
                self.daemon = daemon

            def start(self):
                call_order.append("thread_start")

        with (
            patch("main.run_seed_minio_only", side_effect=_seed),
            patch("main.threading.Thread", side_effect=_FakeThread),
            patch("main.preload_owlv2"),
        ):
            import main as app_main
            import asyncio

            async def _run():
                async with app_main.lifespan(app_main.app):
                    pass

            asyncio.run(_run())

        assert call_order == ["seed", "thread_start"]
