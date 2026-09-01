@@
-app.add_middleware(
-    CORSMiddleware,
-    allow_credentials=True,
-    allow_origins=["*"],
-    allow_methods=["*"],
-    allow_headers=["*"],
-)
+# Configure CORS origins from environment (comma-separated). In production, ALLOWED_ORIGINS must be set.
+allowed_origins_env = os.environ.get('ALLOWED_ORIGINS', '')
+if allowed_origins_env:
+    allowed_origins = [o.strip() for o in allowed_origins_env.split(',') if o.strip()]
+else:
+    allowed_origins = []
+
+if PRODUCTION_MODE and not allowed_origins:
+    raise RuntimeError('PRODUCTION_MODE=true but ALLOWED_ORIGINS is empty. Set ALLOWED_ORIGINS to the allowed origin(s).')
+
+if not allowed_origins and not PRODUCTION_MODE:
+    # developer convenience: allow all origins in non-production
+    allowed_origins = ["*"]
+
+app.add_middleware(
+    CORSMiddleware,
+    allow_credentials=True,
+    allow_origins=allowed_origins,
+    allow_methods=["*"],
+    allow_headers=["*"],
+)
@@
 app.include_router(api_router)
@@
 app.add_middleware(
     CORSMiddleware,
     allow_credentials=True,
-    allow_origins=["*"],
-    allow_methods=["*"],
-    allow_headers=["*"],
+    allow_origins=allowed_origins,
+    allow_methods=["*"],
+    allow_headers=["*"],
 )
