# 🚀 Deploy no Portainer — WhatsBot (Polpê)

A imagem está disponível no GitHub Container Registry:

```
ghcr.io/sxconnect/empreendedor:latest
```

## Pré-requisitos

- Portainer instalado e funcionando
- Acesso via web: `https://seu-servidor:9443`
- Docker funcionando no servidor

## Deploy via Portainer Stack

### Passo 1 — Acessar o Portainer

1. Acesse `https://seu-servidor:9443`
2. Faça login
3. Selecione o ambiente Docker

### Passo 2 — Criar Nova Stack

1. Vá em **Stacks** no menu lateral
2. Clique em **Add stack**
3. Nome: `painel-whats`

### Passo 3 — Configurar a Stack

Cole o conteúdo de `portainer-stack.yml`:

```yaml
version: '3.8'

services:
  painel-whats:
    image: ghcr.io/sxconnect/empreendedor:latest
    container_name: painel-whats
    restart: unless-stopped
    ports:
      - "8083:8080"
    volumes:
      - painel-data:/app/storages
      - painel-uploads:/app/public/uploads
    environment:
      - ADMIN_USERNAME=${ADMIN_USERNAME}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    networks:
      - painel-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  painel-data:
    driver: local
  painel-uploads:
    driver: local

networks:
  painel-network:
    driver: bridge
```

### Passo 4 — Configurar Variáveis de Ambiente

| Nome | Valor |
|---|---|
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | `SuaSenhaSegura123!` |

### Passo 5 — Deploy

1. Clique em **Deploy the stack**
2. Aguarde o download da imagem e inicialização
3. Verifique se o container está rodando

## Acesso

- **Site público:** `http://seu-servidor:8083`
- **Painel admin:** `http://seu-servidor:8083/admin`

## Atualizações

1. No Portainer, vá em **Stacks**
2. Clique na stack `painel-whats`
3. Clique em **Editor**
4. Altere a tag da imagem se necessário
5. Clique em **Update the stack**
6. Marque **Re-pull image and redeploy**
7. Clique em **Update**

---

**WhatsBot pronto para produção! 🎉**
