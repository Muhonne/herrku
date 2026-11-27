create table users (
  id integer primary key autoincrement,
  username text not null unique collate nocase,
  display_name text,
  password_hash text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  disabled_at text,
  last_login_at text,
  created_at text not null,
  updated_at text not null
);

create table sessions (
  id integer primary key autoincrement,
  token_hash text not null unique,
  user_id integer not null references users(id) on delete cascade,
  persistent integer not null default 1,
  created_at text not null,
  last_seen_at text not null,
  expires_at text not null,
  user_agent text,
  ip text
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expiry_idx on sessions(expires_at);

create table invites (
  id integer primary key autoincrement,
  token_hash text not null unique,
  purpose text not null check (purpose in ('invite', 'reset')),
  role text not null default 'member' check (role in ('admin', 'member')),
  user_id integer references users(id) on delete cascade,
  created_by integer references users(id) on delete set null,
  created_at text not null,
  expires_at text not null,
  used_at text
);
create index invites_expiry_idx on invites(expires_at);

create table recipes (
  id integer primary key autoincrement,
  slug text not null unique,
  title text not null,
  description text,
  servings integer check (servings is null or (servings > 0 and servings <= 1000)),
  prep_minutes integer check (prep_minutes is null or (prep_minutes >= 0 and prep_minutes <= 10080)),
  cook_minutes integer check (cook_minutes is null or (cook_minutes >= 0 and cook_minutes <= 10080)),
  source_url text,
  notes text,
  search_text text not null default '',
  created_by integer not null references users(id) on delete restrict,
  created_at text not null,
  updated_at text not null,
  image_path text,
  image_thumb_path text
);
create index recipes_updated_idx on recipes(updated_at desc);
create index recipes_created_by_idx on recipes(created_by);

create table ingredients (
  id integer primary key autoincrement,
  recipe_id integer not null references recipes(id) on delete cascade,
  position integer not null,
  section text,
  quantity real,
  quantity_max real,
  unit text,
  name text not null,
  note text,
  raw_text text
);
create index ingredients_recipe_idx on ingredients(recipe_id, position);

create table steps (
  id integer primary key autoincrement,
  recipe_id integer not null references recipes(id) on delete cascade,
  position integer not null,
  section text,
  text text not null
);
create index steps_recipe_idx on steps(recipe_id, position);

create table recipe_tags (
  recipe_id integer not null references recipes(id) on delete cascade,
  tag text not null,
  primary key (recipe_id, tag)
);
create index recipe_tags_tag_idx on recipe_tags(tag);
