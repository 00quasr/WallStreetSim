CREATE TABLE IF NOT EXISTS "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tick" bigint NOT NULL,
	"agent_id" uuid NOT NULL,
	"action_type" varchar(30) NOT NULL,
	"target_agent_id" uuid,
	"target_symbol" varchar(10),
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"success" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"role" varchar(30) NOT NULL,
	"api_key_hash" varchar(255) NOT NULL,
	"callback_url" text,
	"webhook_secret" varchar(64),
	"alliance_id" uuid,
	"cash" numeric(20, 2) DEFAULT '0' NOT NULL,
	"margin_used" numeric(20, 2) DEFAULT '0' NOT NULL,
	"margin_limit" numeric(20, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"reputation" integer DEFAULT 50 NOT NULL,
	"webhook_failures" integer DEFAULT 0 NOT NULL,
	"last_webhook_error" text,
	"last_webhook_success_at" timestamp,
	"last_response_time_ms" integer,
	"avg_response_time_ms" integer,
	"webhook_success_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "agents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alliances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"profit_share_percent" numeric(5, 2) DEFAULT '0',
	"dissolution_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"dissolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"sector" varchar(30) NOT NULL,
	"industry" varchar(50),
	"shares_outstanding" bigint NOT NULL,
	"revenue" numeric(20, 2) DEFAULT '0',
	"profit" numeric(20, 2) DEFAULT '0',
	"cash" numeric(20, 2) DEFAULT '0',
	"debt" numeric(20, 2) DEFAULT '0',
	"current_price" numeric(20, 4),
	"previous_close" numeric(20, 4),
	"open_price" numeric(20, 4),
	"high_price" numeric(20, 4),
	"low_price" numeric(20, 4),
	"market_cap" numeric(20, 2),
	"volatility" numeric(8, 6) DEFAULT '0.02',
	"beta" numeric(5, 4) DEFAULT '1.0',
	"sentiment" numeric(5, 4) DEFAULT '0',
	"manipulation_score" numeric(8, 6) DEFAULT '0',
	"ceo_agent_id" uuid,
	"is_public" boolean DEFAULT true NOT NULL,
	"ipo_tick" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"quantity" bigint NOT NULL,
	"average_cost" numeric(20, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_agent_symbol_unique" UNIQUE("agent_id","symbol")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"crime_type" varchar(50) NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"tick_opened" bigint NOT NULL,
	"tick_charged" bigint,
	"tick_resolved" bigint,
	"sentence_years" integer,
	"fine_amount" numeric(20, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tick" bigint NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid,
	"channel" varchar(30) DEFAULT 'direct' NOT NULL,
	"subject" varchar(100),
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tick" bigint NOT NULL,
	"headline" text NOT NULL,
	"content" text,
	"category" varchar(30),
	"agent_ids" text DEFAULT '',
	"symbols" text DEFAULT '',
	"sentiment" numeric(5, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"side" varchar(4) NOT NULL,
	"order_type" varchar(10) NOT NULL,
	"quantity" bigint NOT NULL,
	"price" numeric(20, 4),
	"stop_price" numeric(20, 4),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"filled_quantity" bigint DEFAULT 0 NOT NULL,
	"avg_fill_price" numeric(20, 4),
	"tick_submitted" bigint NOT NULL,
	"tick_filled" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tick" bigint NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"buyer_id" uuid,
	"seller_id" uuid,
	"buyer_order_id" uuid,
	"seller_order_id" uuid,
	"quantity" bigint NOT NULL,
	"price" numeric(20, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"current_tick" bigint DEFAULT 0 NOT NULL,
	"market_open" boolean DEFAULT true NOT NULL,
	"interest_rate" numeric(5, 4) DEFAULT '0.05' NOT NULL,
	"inflation_rate" numeric(5, 4) DEFAULT '0.02' NOT NULL,
	"gdp_growth" numeric(5, 4) DEFAULT '0.03' NOT NULL,
	"regime" varchar(20) DEFAULT 'normal' NOT NULL,
	"last_tick_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actions_tick_idx" ON "actions" ("tick");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actions_agent_idx" ON "actions" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actions_type_idx" ON "actions" ("action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_name_idx" ON "agents" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_status_idx" ON "agents" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_alliance_idx" ON "agents" ("alliance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alliances_status_idx" ON "alliances" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_symbol_idx" ON "companies" ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_sector_idx" ON "companies" ("sector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_agent_idx" ON "holdings" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_symbol_idx" ON "holdings" ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investigations_agent_idx" ON "investigations" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investigations_status_idx" ON "investigations" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_tick_idx" ON "messages" ("tick");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_idx" ON "messages" ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_recipient_idx" ON "messages" ("recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_channel_idx" ON "messages" ("channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_tick_idx" ON "news" ("tick");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_category_idx" ON "news" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_agent_idx" ON "orders" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_symbol_status_idx" ON "orders" ("symbol","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_tick_idx" ON "orders" ("tick_submitted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_tick_idx" ON "trades" ("tick");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_symbol_idx" ON "trades" ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_buyer_idx" ON "trades" ("buyer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_seller_idx" ON "trades" ("seller_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_target_agent_id_agents_id_fk" FOREIGN KEY ("target_agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_ceo_agent_id_agents_id_fk" FOREIGN KEY ("ceo_agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holdings" ADD CONSTRAINT "holdings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investigations" ADD CONSTRAINT "investigations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_agents_id_fk" FOREIGN KEY ("sender_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_agents_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_buyer_id_agents_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_seller_id_agents_id_fk" FOREIGN KEY ("seller_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_buyer_order_id_orders_id_fk" FOREIGN KEY ("buyer_order_id") REFERENCES "orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_seller_order_id_orders_id_fk" FOREIGN KEY ("seller_order_id") REFERENCES "orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
