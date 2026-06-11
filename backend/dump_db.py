import sqlite3
import os

DB_NAME = "stats.db"

if not os.path.exists(DB_NAME):
    print(f"Database {DB_NAME} not found")
else:
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT id, timestamp, image_path FROM detections WHERE image_path IS NOT NULL ORDER BY timestamp DESC LIMIT 40")
    rows = cursor.fetchall()
    print(f"Total snapshots with paths: {len(rows)}")
    for row in rows:
        print(row)
    conn.close()
