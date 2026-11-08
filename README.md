# GPS303 Server

Servidor TCP para rastreadores GPS303, com API REST em TypeScript/Bun e persistência em PostgreSQL + TimescaleDB.

## Stack

- Bun + TypeScript
- TCP nativo (`node:net`) para receber os rastreadores
- Express 5 para a API HTTP
- PostgreSQL + TimescaleDB para mensagens, histórico GPS e posição atual
- Driver oficial `pg` (node-postgres), sem Prisma

## Arquitetura de dados

- `gps_messages`: guarda cada mensagem bruta recebida do equipamento.
- `gps_locations`: hypertable TimescaleDB com o histórico de posições. Cada pacote válido gera um novo registo temporal.
- `gps_latest_locations`: uma linha por IMEI, atualizada por UPSERT apenas quando chega uma posição mais recente. É a fonte dos endpoints de posição atual.

A coluna temporal do histórico é `recorded_at`. Os pacotes GPS303 com timestamp no formato `AAMMDDHHMMSS` são interpretados como UTC. O horário de recepção é guardado separadamente em `received_at`.

## Configuração

O ficheiro `.env` deve conter a URL de ligação fornecida pelo PostgreSQL/Timescale Cloud:

```env
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
TCP_PORT=5001
HTTP_PORT=3000
HOST=0.0.0.0
DB_POOL_MAX=20
```

Não comites o ficheiro `.env` nem coloques credenciais no código.

## Instalação e migração

```bash
bun install
bun run db:migrate
```

O script de migração executa `database/schema.sql`, cria a extensão TimescaleDB (se o utilizador tiver permissão), as tabelas, a hypertable e os índices. Executa-o uma vez por ambiente.

## Executar

```bash
bun run dev
```

Portas padrão:
- TCP GPS: `5001`
- API HTTP: `3000`

## API

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/gps` | Estado e contagem de dispositivos/pontos |
| GET | `/gps/messages?limit=100&offset=0` | Mensagens brutas mais recentes |
| GET | `/gps/latest` | Última mensagem recebida |
| GET | `/gps/locations?limit=100&offset=0` | Última posição de cada IMEI |
| GET | `/gps/location/:imei` | Última posição de um dispositivo |
| GET | `/gps/history/:imei?from=ISO&to=ISO&limit=500` | Histórico temporal de um dispositivo |

Os limites são validados e limitados a 1000 registos por pedido. As datas de histórico devem ser datas ISO 8601.

### Exemplos

```bash
curl http://localhost:3000/gps
curl "http://localhost:3000/gps/locations?limit=50"
curl http://localhost:3000/gps/location/869706066439730
curl "http://localhost:3000/gps/history/869706066439730?from=2026-11-01T00:00:00Z&limit=500"
```

## Testar TCP

```bash
nc localhost 5001
```

Envia uma mensagem terminada em ponto e vírgula. Exemplo de formato documentado para GPS303:

```text
imei:869706066439730,tracker,261027161251,100%,F,161251.000,A,0853.50561,S,01314.68010,E,0.00,34.40,,0,0,0.00%,,;
```

O parser existente converte latitude/longitude de graus e minutos para graus decimais.

## Operação e produção

- Configura firewall para permitir TCP 5001 apenas aos rastreadores esperados, quando possível.
- Protege a API HTTP com autenticação antes de a expor publicamente.
- Configura backups e monitorização no serviço PostgreSQL.
- A política de retenção deve ser definida conforme a necessidade legal e operacional; não é aplicada automaticamente.
- Para tráfego elevado, ajusta `DB_POOL_MAX`, monitoriza conexões e considera inserção em lote.
- Usa TLS/SSL na ligação à base de dados (a URL do Timescale Cloud deve incluir `sslmode=require`).
