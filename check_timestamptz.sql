-- Verificação de integridade de tipos de data/hora.
-- Qualquer retorno desta consulta indica que existe coluna em timestamp sem timezone.
SELECT
    table_schema,
    table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    data_type = 'timestamp'
    OR data_type = 'timestamp without time zone'
    OR (data_type = 'timestamp with time zone' AND udt_name <> 'timestamptz')
  )
ORDER BY table_schema, table_name, ordinal_position;

-- Se a consulta acima retornar linhas, o banco está fora do padrão exigido.
-- O padrão correto em VortexWeb é usar TIMESTAMPTZ em todas as colunas de data/hora.
