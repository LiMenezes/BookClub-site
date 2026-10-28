CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(40) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  bio TEXT DEFAULT '',
  reading_goal INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS books (
  id BIGSERIAL PRIMARY KEY,
  external_id VARCHAR(180),
  title VARCHAR(300) NOT NULL,
  author VARCHAR(300) NOT NULL,
  genre VARCHAR(120) DEFAULT 'Geral',
  year VARCHAR(20),
  pages INTEGER,
  synopsis TEXT,
  cover_url TEXT,
  isbn VARCHAR(30),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS books_external_idx ON books(external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS shelves (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK(status IN ('lendo','quero-ler','lido','abandonado')),
  progress INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, book_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
  rating NUMERIC(2,1) NOT NULL CHECK(rating >= 0 AND rating <= 5),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);
CREATE TABLE IF NOT EXISTS review_likes (
  review_id BIGINT REFERENCES reviews(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(review_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT REFERENCES reviews(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  following_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(follower_id, following_id),
  CHECK(follower_id <> following_id)
);
CREATE TABLE IF NOT EXISTS lists (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS list_books (
  list_id BIGINT REFERENCES lists(id) ON DELETE CASCADE,
  book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(list_id, book_id)
);
CREATE TABLE IF NOT EXISTS quotes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  page INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_book_idx ON reviews(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shelves_user_idx ON shelves(user_id, status);
