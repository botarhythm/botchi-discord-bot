-- ベクトル検索用のストアードプロシージャ
CREATE OR REPLACE FUNCTION create_match_chunks_function()
RETURNS void AS $$
BEGIN
  -- 関数が存在しない場合に限り作成
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'match_chunks'
  ) THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION match_chunks(
      query_embedding VECTOR(1536),
      match_threshold FLOAT,
      match_count INT
    )
    RETURNS TABLE (
      id UUID,
      content TEXT,
      knowledge_id UUID,
      metadata JSONB,
      similarity FLOAT
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        kc.id,
        kc.content,
        kc.knowledge_id,
        kc.metadata,
        1 - (kc.embedding <=> query_embedding) AS similarity
      FROM
        knowledge_chunks kc
      WHERE
        1 - (kc.embedding <=> query_embedding) > match_threshold
      ORDER BY
        similarity DESC
      LIMIT
        match_count;
    END;
    $$;';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 関数を実行して作成
SELECT create_match_chunks_function();