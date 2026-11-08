# GPS303 Server

Servidor de rastreamento GPS303 construído com Bun e TypeScript. Recebe dados dos rastreadores através de TCP, disponibiliza uma API REST e persiste mensagens e posições em PostgreSQL + TimescaleDB.

## Funcionalidades

- Receção de mensagens GPS através de TCP usando `node:net`.
- API REST construída com Express 5.
- Autenticação dos rastreadores através de uma lista de IMEIs autorizados.
- Registo das mensagens brutas recebidas.
- Armazenamento do histórico de posições numa hypertable TimescaleDB.
- Consulta rápida da última localização de cada dispositivo.
- CRUD de dispositivos autorizados (criar, consultar, atualizar, desativar e remover).
- Dockerfile e Docker Compose para executar a aplicação e a base de dados.

## Stack tecnológica

- Bun + TypeScript
- Node.js TCP API (`node:net`)
- Express 5
- PostgreSQL + TimescaleDB
- `pg` (node-postgres), sem Prisma
- Docker e Docker Compose

## Arquitetura

O projeto é composto por dois serviços principais:

| Serviço | Responsabilidade | Porta padrão |
|---|---|---:|
| `gps-server` | API HTTP e servidor TCP para os rastreadores | 3000 / 5001 |
| `timescaledb` | Persistência PostgreSQL + TimescaleDB | 5432 |

### Fluxo de autenticação GPS

1. O rastreador estabelece uma ligação TCP à porta `5001`.
2. Envia a mensagem de login com o IMEI.
3. O servidor valida o formato do IMEI (15 dígitos) e consulta a tabela `allow_imei`.
4. Apenas dispositivos existentes e com `enabled = true` são autenticados.
5. Após autenticação, o servidor atualiza a data da última ligação e responde com `LOAD\r\n`.
6. As mensagens seguintes são associadas ao IMEI autenticado. Mensagens de localização com IMEI diferente são rejeitadas.

Dispositivos desconhecidos, desativados ou com IMEI inválido não são autorizados. As mensagens recebidas são registadas em `gps_messages`, incluindo tentativas de login não autorizadas.

**Nota:** desativar ou remover um IMEI impede novas autenticações. Uma ligação TCP que já tenha sido autenticada permanece ativa até ser encerrada; a revogação imediata de sessões existentes ainda não está implementada.

## Modelo de dados

| Tabela | Descrição |
|---|---|
| `allow_imei` | Lista de dispositivos autorizados, estado e dados da última ligação |
| `gps_messages` | Mensagens brutas recebidas, IMEI, endereço remoto e data de receção |
| `gps_locations` | Histórico de posições GPS numa hypertable TimescaleDB |
| `gps_latest_locations` | Última posição conhecida de cada IMEI |

A hypertable `gps_locations` utiliza `recorded_at` como coluna temporal. O timestamp do dispositivo no formato `AAMMDDHHMMSS` é interpretado como UTC. A data em que o servidor recebeu o pacote é guardada separadamente em `received_at`.

## Requisitos

### Execução local

- Bun
- PostgreSQL com extensão TimescaleDB
- Acesso à base de dados através de uma URL PostgreSQL

### Execução com Docker

- Docker Engine
- Docker Compose v2

## Configuração

### Docker Compose

Cria o ficheiro de ambiente:

```bash
cp .env.example .env
```

Configura os valores em `.env`:

```env
POSTGRES_DB=gpsdb
POSTGRES_USER=gps
POSTGRES_PASSWORD=define_uma_password_forte
POSTGRES_PORT=5432

HTTP_PORT=3000
TCP_PORT=5001
DB_POOL_MAX=20
```

Altera obrigatoriamente `POSTGRES_PASSWORD` antes de executar em qualquer ambiente partilhado ou de produção. Não publiques nem comites o ficheiro `.env`.

O Compose cria uma base de dados TimescaleDB, aguarda pelo health check e só depois inicia o servidor. O container da aplicação executa automaticamente `bun run db:migrate` antes de iniciar.

### PostgreSQL/TimescaleDB externo

Se utilizares Timescale Cloud ou outra instância externa, configura `DATABASE_URL` no ambiente da aplicação:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
TCP_PORT=5001
HTTP_PORT=3000
HOST=0.0.0.0
DB_POOL_MAX=20
```

Neste cenário, executa a aplicação localmente ou adapta o serviço `gps-server` do Compose para receber a URL externa. Não precisas de iniciar o serviço `timescaledb` local.

## Executar com Docker Compose

Na raiz do projeto:

```bash
cp .env.example .env
# Edita .env e define uma password forte
docker compose config
docker compose up -d --build
```

Verifica os containers:

```bash
docker compose ps
```

Acompanha os logs:

```bash
docker compose logs -f gps-server
docker compose logs -f timescaledb
```

Reconstruir e iniciar após alterações no código:

```bash
docker compose up -d --build
```

Parar os serviços, preservando os dados:

```bash
docker compose down
```

Parar os serviços e apagar também o volume da base de dados:

```bash
docker compose down -v
```

**Atenção:** `docker compose down -v` elimina permanentemente os dados persistidos no volume `timescale_data`.

## Executar localmente (sem Docker)

Instala as dependências:

```bash
bun install
```

Configura as variáveis de ambiente, incluindo `DATABASE_URL`, e aplica o schema:

```bash
bun run db:migrate
```

Inicia em modo de desenvolvimento:

```bash
bun run dev
```

Inicia em modo normal:

```bash
bun run start
```

Verifica os tipos:

```bash
bun run typecheck
```

## API REST

Base URL local: `http://localhost:3000`

### Estado e rastreamento

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/gps` | Estado do servidor e contagem de dispositivos/pontos |
| GET | `/gps/messages?limit=100&offset=0` | Lista mensagens brutas recebidas |
| GET | `/gps/latest` | Devolve a mensagem mais recente |
| GET | `/gps/locations?limit=100&offset=0` | Última posição de cada dispositivo |
| GET | `/gps/location/:imei` | Última posição de um dispositivo |
| GET | `/gps/history/:imei?from=ISO&to=ISO&limit=500` | Histórico de posições de um dispositivo |

Os parâmetros `limit` e `offset` permitem paginação. O limite é ajustado entre 1 e 1000 registos. As datas `from` e `to` devem estar no formato ISO 8601.

As respostas de localização incluem latitude, longitude, velocidade, nível da bateria, timestamp, validade e um link para abrir as coordenadas no Google Maps.

### Gestão de dispositivos autorizados

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/gps/allowed-devices` | Lista dispositivos autorizados |
| POST | `/gps/allowed-devices` | Regista um dispositivo |
| GET | `/gps/allowed-devices/:imei` | Consulta um dispositivo |
| PATCH | `/gps/allowed-devices/:imei` | Atualiza nome, descrição ou estado |
| DELETE | `/gps/allowed-devices/:imei` | Remove um dispositivo da lista |

#### Registar um dispositivo

```bash
curl -X POST http://localhost:3000/gps/allowed-devices \
  -H "Content-Type: application/json" \
  -d '{
    "imei": "869706066439730",
    "name": "Viatura de entregas 01",
    "description": "Rastreador GPS da viatura",
    "enabled": true
  }'
```

O IMEI deve conter exatamente 15 dígitos. O campo `enabled` é opcional e assume `true` por padrão. Um IMEI já registado devolve HTTP 409.

#### Listar dispositivos

```bash
curl "http://localhost:3000/gps/allowed-devices"
```

Filtrar por estado e paginar:

```bash
curl "http://localhost:3000/gps/allowed-devices?enabled=true&limit=50&offset=0"
```

#### Consultar um dispositivo

```bash
curl http://localhost:3000/gps/allowed-devices/869706066439730
```

#### Atualizar um dispositivo

Só é possível atualizar `name`, `description` e `enabled`. O IMEI é imutável.

```bash
curl -X PATCH http://localhost:3000/gps/allowed-devices/869706066439730 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Viatura principal",
    "enabled": false
  }'
```

Para voltar a autorizar o dispositivo, atualiza `enabled` para `true`.

#### Remover um dispositivo

```bash
curl -X DELETE http://localhost:3000/gps/allowed-devices/869706066439730
```

### Exemplos de consulta GPS

```bash
curl http://localhost:3000/gps
curl "http://localhost:3000/gps/locations?limit=50"
curl http://localhost:3000/gps/location/869706066439730
curl "http://localhost:3000/gps/history/869706066439730?from=2026-11-01T00:00:00Z&limit=500"
```

## Testar a ligação TCP

Depois de registares o IMEI na lista de permissões, configura o rastreador para apontar para o endereço público do servidor e para a porta TCP `5001`.

Para testar a porta a partir de uma máquina com netcat:

```bash
nc <HOST_DO_SERVIDOR> 5001
```

O protocolo de login e o formato dos pacotes devem corresponder ao firmware/configuração do equipamento. Exemplo de mensagem de localização documentada para GPS303:

```text
imei:869706066439730,tracker,261027161251,100%,F,161251.000,A,0853.50561,S,01314.68010,E,0.00,34.40,,0,0,0.00%,,;
```

O parser converte latitude e longitude do formato graus/minutos para graus decimais.

## Segurança e operação

- Define uma password forte para PostgreSQL e protege o ficheiro `.env`.
- Não exponhas a porta PostgreSQL `5432` à Internet sem necessidade. Em produção, considera remover o mapeamento público dessa porta no Compose.
- Restringe a porta TCP `5001` no firewall sempre que possível.
- A API HTTP não possui autenticação integrada neste momento. Coloca-a atrás de uma camada de autenticação/proxy antes de a expor publicamente.
- Usa TLS/SSL na ligação a bases de dados externas; por exemplo, `sslmode=require` no Timescale Cloud.
- Configura backups regulares do PostgreSQL e monitoriza o espaço ocupado pelo histórico GPS.
- A política de retenção dos dados não é aplicada automaticamente; define-a conforme os requisitos operacionais e legais.
- Ajusta `DB_POOL_MAX` de acordo com a capacidade da base de dados e o volume de ligações.

## Estrutura do projeto

```text
GPS-Server/
├── database/
│   └── schema.sql
├── scripts/
│   └── migrate.ts
├── src/
│   ├── database.ts
│   ├── httpServer.ts
│   ├── tcpServer.ts
│   ├── lib/
│   ├── routes/
│   │   └── gps.controller.ts
│   └── service/
│       └── GPS_Metrics.ts
├── index.ts
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── package.json
└── README.md
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `bun run dev` | Executa em desenvolvimento com watch |
| `bun run start` | Inicia o servidor |
| `bun run db:migrate` | Aplica o schema na base de dados |
| `bun run typecheck` | Verifica os tipos TypeScript |
