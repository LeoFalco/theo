# Theo

Kit com ferramentas e scripts para fluxos de trabalho de desenvolvedores

## Pré-requisitos

- [Node.js](https://nodejs.org) na versão do arquivo `.nvmrc`
- [Bun](https://bun.sh), instalado automaticamente pelo script de instalação
- [Git](https://git-scm.com/downloads)
- [GitHub CLI](https://cli.github.com) autenticado com `gh auth login`
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) com a extensão `azure-devops`, apenas para repositórios no Azure DevOps

## Instalação

### Linux e macOS

  ```sh
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
  ```

### Windows (PowerShell)

  ```powershell
  irm https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.ps1 | iex
  ```

Reinicie o terminal ao final da instalação.

## Atualização

Rode `theo-update` em qualquer plataforma.

## Runtime

O `theo` roda no [Bun](https://bun.sh). Se algum comando se comportar diferente, rode com o Node definindo `THEO_RUNTIME=node`, por exemplo `THEO_RUNTIME=node theo merge`.

## Resumo dos comandos disponíveis

- `theo --help` mostra ajuda e lista comandos disponíveis
