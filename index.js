const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '2mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'chat-memory-api' });
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(500).json({
      ok: false,
      db: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});

app.post("/debug/insert-chat", async (req, res) => {
  try {
    const { chat_id } = req.body;

    const result = await pool.query(
      `
      insert into chats (chat_id)
      values ($1)
      on conflict (chat_id)
      do update set updated_at = now()
      returning *
      `,
      [chat_id]
    );

    res.json({ ok: true, row: result.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/debug/chats", async (req, res) => {
  try {
    const result = await pool.query(`
      select *
      from chats
      order by updated_at desc
      limit 20
    `);

    res.json({ ok: true, rows: result.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
