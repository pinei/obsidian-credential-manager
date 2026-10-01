# Releases por tag

O workflow [release.yml](.github/workflows/release.yml) roda quando uma tag e enviada ao GitHub. Ele confere se a tag corresponde a `manifest.json` e se `versions.json` associa essa versao ao `minAppVersion`, instala as dependencias de build com `npm ci --include=dev`, executa `npm run build`, gera atestacoes para os artefatos e cria um **release em rascunho** com `main.js`, `manifest.json` e `styles.css`. Os arquivos gerados nao precisam ser adicionados ao Git.

## Preparacao unica

1. Publique o workflow na branch que sera usada para os releases antes de criar a primeira tag. Inclua a excecao em `.gitignore` e as instrucoes no mesmo commit:

   ```bash
   git add .gitignore .github/workflows/release.yml INSTRUCTIONS.md
   git commit -m "Add tag-based release workflow"
   git push origin HEAD
   ```

   A tag deve apontar para um commit que ja contenha o workflow.

2. Em **Settings -> Actions -> General -> Workflow permissions**, selecione **Read and write permissions** e salve. O workflow tambem solicita permissoes para gerar atestacoes de artefatos.

## Criar um release

1. Escolha uma versao SemVer, sem prefixo `v` (por exemplo, `1.1.2`). Atualize `minAppVersion` em `manifest.json` se a compatibilidade minima tiver mudado.

2. Na raiz do repositorio, execute:

   ```bash
   npm version 1.1.2 --no-git-tag-version
   npm test
   npm run build
   ```

   O script de versao sincroniza `manifest.json` e `versions.json` com a versao de `package.json`; o npm tambem atualiza `package-lock.json`.

3. Confira as alteracoes, crie e publique um commit com os metadados de versao:

   ```bash
   git add package.json package-lock.json manifest.json versions.json
   git commit -m "Release 1.1.2"
   git push origin HEAD
   ```

4. Crie a tag **no commit publicado** e envie-a separadamente:

   ```bash
   git tag -a 1.1.2 -m "1.1.2"
   git push origin 1.1.2
   ```

5. Em **Actions** no GitHub, confira a execucao do workflow. Em **Releases**, abra o rascunho, confira os tres arquivos anexados, adicione as notas da versao e selecione **Publish release**. O envio da tag cria apenas o rascunho, nao publica o release automaticamente.

Use o mesmo numero de versao em todos os comandos. Se a tag nao coincidir com `manifest.json` ou o mapeamento de `versions.json` estiver incorreto, o workflow para antes de criar o release. Tags devem ser unicas: para corrigir uma falha, ajuste o commit e crie uma nova versao em vez de reutilizar uma tag ja publicada.

Referencia: [Release your plugin with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions).