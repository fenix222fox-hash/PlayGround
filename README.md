# ROMFOLIO

Aplicação web local para organizar uma coleção de jogos e preparar um projeto Android com seus próprios arquivos ROM.

## Usar

Abra `index.html` em um navegador moderno. Adicione arquivos arrastando-os para a biblioteca ou usando **Adicionar jogos**. Depois, em **Preparar pacote**, escolha **Configurar pacote** e exporte o projeto Android `.zip`.

Os arquivos são processados no navegador; a biblioteca não é enviada a um servidor e não persiste depois que a aba é fechada. A interface inclui exemplos demonstrativos, que não são jogos reais.

## O que a exportação faz

O ZIP gerado contém um projeto Android Studio, metadados e cópias dos ROMs escolhidos em `app/src/main/assets/games/`. O aplicativo Android de exemplo mostra um catálogo, mas **não contém emulador e não gera um APK pronto**. Para jogar, é necessário integrar um runtime/emulador compatível e licenciado e compilar com Android Studio/Android SDK.

Use somente conteúdo próprio, homebrew ou para o qual você tenha autorização, e respeite as licenças de qualquer runtime integrado.
