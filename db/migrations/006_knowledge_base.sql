-- Migration: 004_knowledge_base
-- Purpose: Store documents and their semantic vector chunks for RAG

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    filename TEXT,
    source_url TEXT,
    doc_type TEXT NOT NULL, -- 'file', 'website', 'manual_entry'
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'active', 'failed'
    total_chunks INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding JSONB, -- Array of numbers (vectors)
    chunk_index INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookup by document
CREATE INDEX idx_knowledge_chunks_doc ON knowledge_chunks(document_id);
