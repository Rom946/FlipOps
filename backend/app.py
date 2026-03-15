from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    os.environ.get("FRONTEND_ORIGIN", ""),  # set to your GitHub Pages URL in Render env vars
]
CORS(app, resources={r"/api/*": {"origins": [o for o in ALLOWED_ORIGINS if o]}})

from routes.search import search_bp
from routes.negotiate import negotiate_bp
from routes.listing import listing_bp
from routes.pipeline import pipeline_bp
from routes.user import user_bp
from routes.admin import admin_bp
from routes.appointments import appointments_bp

app.register_blueprint(search_bp)
app.register_blueprint(negotiate_bp)
app.register_blueprint(listing_bp)
app.register_blueprint(pipeline_bp)
app.register_blueprint(user_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(appointments_bp)


@app.route("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_ENV") == "development")
