from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.complaints import router as complaints_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
	yield


settings = get_settings()
app = FastAPI(title="CivicPulse API", lifespan=lifespan)

app.add_middleware(
	CORSMiddleware,
	allow_origins=[settings.cors_origin],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)
app.include_router(complaints_router, prefix="/api")
