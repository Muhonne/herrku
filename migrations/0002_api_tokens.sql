create table api_tokens (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  prefix text not null,
  created_at text not null,
  last_used_at text,
  expires_at text
);

create index api_tokens_user_idx on api_tokens(user_id);
