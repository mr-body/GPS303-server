# GPS303 Server

Servidor leve para receber, registrar e consultar mensagens enviadas por rastreadores veiculares GPS303.

A aplicação mantém dois serviços ativos simultaneamente:

- **Servidor TCP:** recebe as mensagens diretamente dos dispositivos GPS.
- **API HTTP REST:** permite consultar o status do servidor e as mensagens recebidas.

O projeto foi desenvolvido com **Bun**, **TypeScript**, **Express** e o módulo nativo `node:net`, funcionando como uma base simples para sistemas de rastreamento veicular, logística, entregas e gerenciamento de frotas.

> **Status do projeto:** protótipo funcional. As mensagens são armazenadas apenas em memória e o protocolo GPS303 ainda não é interpretado em campos estruturados, como latitude, longitude, velocidade e direção.

## Sumário

- [Características](#características)
- [Tecnologias utilizadas](#tecnologias-utilizadas)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Execução](#execução)
- [Portas e configuração](#portas-e-configuração)
- [Funcionamento](#funcionamento)
- [API HTTP](#api-http)
- [Exemplos de resposta](#exemplos-de-resposta)
- [Teste da API](#teste-da-api)
- [Teste de uma mensagem TCP](#teste-de-uma-mensagem-tcp)
- [Formato das mensagens](#formato-das-mensagens)
- [Limitações atuais](#limitações-atuais)
- [Próximos passos](#próximos-passos)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Segurança e uso em produção](#segurança-e-uso-em-produção)
- [Contribuição](#contribuição)
- [Licença](#licença)

## Características

- Recepção de conexões TCP de rastreadores GPS303.
- Processamento de múltiplas mensagens na mesma conexão TCP.
- Identificação da origem da conexão por endereço IP e porta remota.
- Separação das mensagens usando `;` como delimitador.
- Registro das mensagens recebidas no console.
- Armazenamento temporário das últimas **100 mensagens**.
- API REST construída com Express.
- Endpoint para verificar o status dos serviços.
- Endpoint para consultar todas as mensagens armazenadas.
- Endpoint para consultar somente a mensagem mais recente.
- Limite de segurança de **8 KB por buffer TCP**.
- Nenhum banco de dados necessário para executar o protótipo.

## Tecnologias utilizadas

- [Bun](https://bun.sh/) — runtime JavaScript/TypeScript e gerenciador de pacotes.
- [TypeScript](https://www.typescriptlang.org/) — tipagem estática.
- [Express](https://expressjs.com/) — API HTTP REST.
- [`node:net`](https://nodejs.org/api/net.html) — servidor TCP baseado em sockets.

## Requisitos

Antes de começar, instale:

- [Bun](https://bun.sh/docs/installation) versão 1.4 ou superior.
- Um dispositivo GPS303, um simulador TCP ou uma ferramenta como `netcat` para enviar mensagens de teste.
- Acesso à porta TCP configurada no servidor.

Verifique a instalação do Bun:

```bash
bun --version
```

## Instalação

Clone o repositório e entre no diretório do projeto:

```bash
git clone https://github.com/mr-body/GPS303-server.git
cd GPS303-server
```

Instale as dependências:

```bash
bun install
```

## Execução

Inicie o servidor com:

```bash
bun run src/index.ts
```

Ao iniciar corretamente, a aplicação exibirá mensagens semelhantes a:

```text
[TCP] À espera de GPS na porta 5001
[HTTP] API disponível na porta 3000
```

Os dois serviços ficam disponíveis enquanto o processo estiver em execução.

Para interromper o servidor, pressione `Ctrl+C`.

## Portas e configuração

Por padrão, o servidor utiliza:

| Serviço | Porta | Endereço |
|---|---:|---|
| TCP GPS | `5001` | `0.0.0.0:5001` |
| API HTTP | `3000` | `0.0.0.0:3000` |

As portas estão atualmente definidas diretamente no arquivo `src/index.ts`:

```typescript
const TCP_PORT = 5001;
const HTTP_PORT = 3000;
```

Para utilizar outras portas, altere esses valores antes de iniciar a aplicação. Em um ambiente de produção, recomenda-se substituir essa configuração fixa por variáveis de ambiente.

## Funcionamento

O fluxo básico da aplicação é:

1. O servidor TCP aguarda conexões dos rastreadores na porta `5001`.
2. Quando um dispositivo se conecta, o endereço remoto é registrado no console.
3. Os dados recebidos são acumulados em um buffer por conexão.
4. Cada mensagem terminada por `;` é considerada completa.
5. A mensagem é armazenada junto com:
   - conteúdo original;
   - data e hora de recebimento em formato ISO 8601;
   - endereço IP e porta de origem.
6. Quando o limite de 100 mensagens é ultrapassado, a mensagem mais antiga é removida.
7. A API HTTP disponibiliza os dados armazenados para consulta.

O servidor também encerra a conexão quando o buffer de uma sessão ultrapassa 8 KB, evitando crescimento indefinido de memória causado por dados incompletos ou malformados.

## API HTTP

### Verificar o status do servidor

```http
GET /
```

Retorna o estado atual da aplicação e as portas utilizadas pelos serviços TCP e HTTP.

### Consultar todas as mensagens

```http
GET /gps/messages
```

Retorna as mensagens atualmente armazenadas em memória, do registro mais antigo para o mais recente.

### Consultar a última mensagem

```http
GET /gps/latest
```

Retorna somente o registro mais recente recebido pelo servidor.

Se nenhuma mensagem tiver sido recebida, a API retorna o status HTTP `404`.

## Exemplos de resposta

### `GET /`

```json
{
  "name": "GPS303 Server",
  "status": "online",
  "tcpPort": 5001,
  "httpPort": 3000
}
```

### `GET /gps/messages`

```json
{
  "total": 1,
  "data": [
    {
      "message": "exemplo-de-mensagem-gps;",
      "receivedAt": "2026-10-23T18:40:05.000Z",
      "remoteAddress": "127.0.0.1:54321"
    }
  ]
}
```

### `GET /gps/latest`

```json
{
  "message": "exemplo-de-mensagem-gps;",
  "receivedAt": "2026-10-23T18:40:05.000Z",
  "remoteAddress": "127.0.0.1:54321"
}
```

### Nenhuma mensagem disponível

```json
{
  "message": "Ainda não foram recebidas mensagens GPS"
}
```

## Teste da API

Com o servidor em execução, use `curl`:

```bash
curl http://localhost:3000/
```

Consultar todas as mensagens:

```bash
curl http://localhost:3000/gps/messages
```

Consultar a última mensagem:

```bash
curl http://localhost:3000/gps/latest
```

## Teste de uma mensagem TCP

Em um terminal separado, conecte-se à porta TCP usando `netcat`:

```bash
nc localhost 5001
```

Em seguida, envie uma mensagem finalizada com `;`:

```text
imei:123456789012345,tracker:GPS303,lat:-23.5505,lon:-46.6333;
```

Depois, consulte a API:

```bash
curl http://localhost:3000/gps/latest
```

> O conteúdo acima é apenas um exemplo de teste. O servidor atualmente armazena a mensagem recebida como texto e não valida nem interpreta seus campos.

## Formato das mensagens

O servidor utiliza `;` como delimitador de fim de mensagem. Isso permite que uma única conexão TCP envie várias mensagens em sequência:

```text
mensagem-1;mensagem-2;mensagem-3;
```

Cada trecho terminado por `;` é processado individualmente.

Como o TCP é um protocolo orientado a fluxo, uma mensagem pode chegar dividida em vários pacotes ou várias mensagens podem chegar no mesmo pacote. O buffer implementado em `src/index.ts` trata esses casos enquanto aguarda o delimitador configurado.

## Limitações atuais

Este projeto ainda não deve ser considerado um servidor de rastreamento pronto para produção. Atualmente:

- As mensagens são armazenadas somente em memória.
- Os dados são perdidos quando o processo é reiniciado.
- Não existe banco de dados ou histórico persistente.
- O protocolo GPS303 não é interpretado nem validado.
- Latitude, longitude, velocidade, direção e status não são extraídos automaticamente.
- Não há autenticação dos dispositivos.
- Não há autorização na API HTTP.
- Não há TLS/SSL para as conexões TCP ou HTTP.
- Não há rate limiting ou proteção contra abuso.
- As portas são configuradas diretamente no código.
- Não há testes automatizados configurados.
- Não há monitoramento, métricas ou sistema de alertas.

## Próximos passos

Algumas evoluções planejadas para transformar o protótipo em uma solução mais completa:

- Criar um parser específico para o protocolo GPS303.
- Validar IMEI, identificadores e comandos recebidos.
- Converter as mensagens em objetos estruturados.
- Persistir os dados em PostgreSQL, SQLite, Redis ou outro banco adequado.
- Adicionar autenticação e autorização para dispositivos e usuários.
- Implementar WebSocket ou Server-Sent Events para atualizações em tempo real.
- Criar endpoints para consultar dispositivos, posições e histórico.
- Adicionar filtros por dispositivo e intervalo de datas.
- Implementar variáveis de ambiente para portas e configurações.
- Adicionar logs estruturados e rotação de arquivos.
- Configurar testes unitários e de integração.
- Adicionar Docker e configuração para deploy.
- Implementar TLS, rate limiting e validação de entrada.
- Criar uma interface web para visualização da frota em um mapa.

## Estrutura do projeto

```text
GPS303-server/
├── src/
│   └── index.ts       # Servidor TCP e API HTTP
├── package.json       # Dependências e configuração do projeto
├── tsconfig.json      # Configuração do TypeScript
├── bun.lock           # Versões travadas das dependências
└── README.md          # Documentação do projeto
```

## Segurança e uso em produção

Antes de disponibilizar o servidor na internet ou conectá-lo a uma frota real, recomenda-se:

1. Restringir o acesso à porta TCP por firewall ou rede privada.
2. Implementar autenticação dos dispositivos por IMEI, token ou certificado.
3. Validar o tamanho e o conteúdo das mensagens recebidas.
4. Adicionar limites de conexões e de mensagens por dispositivo.
5. Usar HTTPS na API e TLS no canal de comunicação quando suportado.
6. Persistir os dados em um banco com política de backup.
7. Evitar retornar dados sensíveis sem autenticação.
8. Monitorar erros, conexões ativas, consumo de memória e disponibilidade.
9. Utilizar um processo supervisor, container ou serviço de gerenciamento.
10. Não expor diretamente portas administrativas ou de desenvolvimento.

## Contribuição

Contribuições são bem-vindas. Para propor uma alteração:

1. Faça um fork do projeto.
2. Crie uma branch para sua alteração:

   ```bash
   git checkout -b feature/minha-alteracao
   ```

3. Faça as alterações e teste localmente.
4. Envie os commits para o seu fork.
5. Abra um Pull Request descrevendo o problema e a solução proposta.

## Exemplo de pacote recebido por um GPS Tracker (GPS303) com formato corregido pelo programador.

```bash
imei:869706066439730,tracker,261027161251,100%,F,161251.000,A,0853.50561,S,01314.68010,E,0.00,34.40,,0,0,0.00%,,;
```

codigo que corrige o formato do pacote: 
```javascript
const fields = message.replace(/;$/, "").split(",");
````
### Significado

| Índice | Valor | Significado |
|---|---|---|
| 0 | imei:869706066439730 | IMEI do rastreador |
| 1 | tracker | Tipo de mensagem: dados do rastreamento |
| 2 | 261027161251 | Data no formato AAMMDDHHMMSS |
| 3 | 100% | Indicador de bateria reportado pelo dispositivo |
| 4 | F | Tipo de pacote de localização |
| 5 | 161251.000 | Hora GPS: 16:12:51.000 |
| 6 | A | Estado da posição: válida/ativa |
| 7 | 0853.50561 | Latitude em graus e minutos |
| 8 | S | Hemisfério sul |
| 9 | 01314.68010 | Longitude em graus e minutos |
| 10 | E | Hemisfério este |
| 11 | 0.00 | Velocidade reportada, provavelmente em nós |
| 12 | 34.40 | Campo numérico adicional; pode representar direção/curso, conforme a versão do protocolo |
| 13 | vazio | Campo não preenchido |
| 14 | 0 | Campo de estado ou indicador |
| 15 | 0 | Campo de estado ou indicador |
| 16 | 0.00% | Campo percentual reportado pelo equipamento |
| 17 | vazio | Campo não preenchido |
| 18 | ; | Terminador da mensagem |

Os campos importantes são:

### Localização
- **F**: Mensagem com dados de posição.
- **A**: Estado de posição válida, neste formato.
- **0853.50897,S**: Latitude em graus e minutos, a sul.
- **01314.68184,E**: Longitude em graus e minutos, a este.
- **0.00**: Velocidade reportada, provavelmente em nós, conforme o protocolo.

### A posição precisa de ser convertida de graus e minutos para graus decimais antes de a usares num mapa.

### Coordenadas decimais:
- **Latitude: -8.891816**
- **Longitude: 13.244697**

A conversão é feita assim:

$$ \text{Graus decimais} = \text{graus} + \frac{\text{minutos}}{60} $$

Como a latitude tem hemisfério S, o resultado é negativo. A longitude com E é positiva.

## Licença

Este projeto ainda não possui uma licença definida. Se você pretende utilizar, modificar ou distribuir o código, defina uma licença no repositório antes de usá-lo em um projeto comercial ou de terceiros.
