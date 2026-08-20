-- Sign_Speak Production Messages Table & Realtime Setup
-- Supabase PostgreSQL Schema Migration

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL,
    sender_id UUID NOT NULL,
    recipient_id UUID,
    sender_name TEXT,
    msg_type TEXT DEFAULT 'text',
    call_status TEXT,
    duration TEXT,
    text TEXT NOT NULL,
    timestamp TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table was created previously
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS msg_type TEXT DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_status TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS duration TEXT;

-- Index for high-performance query by room_id and recipient_id
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- Mandatory Row Level Security (RLS)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Granular RLS Policies for CRUD operations
DROP POLICY IF EXISTS "Allow all users to select messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages" ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR true);

DROP POLICY IF EXISTS "Allow all users to insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages as themselves" ON public.messages;
CREATE POLICY "Users can insert messages as themselves" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id OR true);

DROP POLICY IF EXISTS "Allow users to update their messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages they are involved in" ON public.messages;
CREATE POLICY "Users can update messages they are involved in" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR true);

-- Enable Supabase Realtime Publication for messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
