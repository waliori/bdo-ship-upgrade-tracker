-- BDO Recipe Tracker Database Schema
-- Simple, clean design without assumptions

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (Discord auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discord_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(32) NOT NULL,
    avatar_hash VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (no assumptions, dynamically populated)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items (everything in BDO)
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bdo_id INTEGER UNIQUE,
    name VARCHAR(200) NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    grade SMALLINT DEFAULT 0,
    icon VARCHAR(100),
    description TEXT,
    properties JSONB,
    bdo_data JSONB, -- Raw CalpheonJS data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipes
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    name VARCHAR(200),
    station VARCHAR(100),
    requirements JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe materials
CREATE TABLE recipe_materials (
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (recipe_id, item_id)
);

-- User recipes (what users want to craft)
CREATE TABLE user_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    target_quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);

-- User inventory (what users have)
CREATE TABLE user_inventory (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, item_id)
);

-- Indexes
CREATE INDEX idx_items_bdo_id ON items(bdo_id);
CREATE INDEX idx_items_name ON items(name);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_recipes_item ON recipes(item_id);
CREATE INDEX idx_user_recipes_user ON user_recipes(user_id);
CREATE INDEX idx_user_inventory_user ON user_inventory(user_id);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_update_timestamp
    BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER users_update_timestamp
    BEFORE UPDATE ON users  
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER user_inventory_update_timestamp
    BEFORE UPDATE ON user_inventory
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();