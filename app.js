/* ROMFOLIO — biblioteca local e exportador de projeto Android. */
(() => {
  'use strict';

  // 1. Configuração e estado da sessão
  const ALLOWED_EXTENSIONS = new Set([
    'nes', 'gb', 'gbc', 'gba', 'sfc', 'smc', 'nds', 'n64', 'z64',
    'iso', 'bin', 'rom', 'zip',
  ]);
  const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
  const SYSTEMS = {
    gba: { label: 'GBA', icon: '🟩', color: '' },
    nes: { label: 'NES', icon: '🟥', color: 'orange' },
    snes: { label: 'SNES', icon: '🟦', color: 'purple' },
    gb: { label: 'GB', icon: '⬛', color: '' },
    other: { label: 'Outro', icon: '🎮', color: 'orange' },
  };
  const state = {
    games: [
      { name: 'Pocket Garden', file: 'pocket-garden.gba', system: 'gba', size: 512 * 1024, example: true, addedAt: 3 },
      { name: 'Tiny Adventure', file: 'tiny-adventure.nes', system: 'nes', size: 256 * 1024, example: true, addedAt: 2 },
      { name: 'Moonlight Quest', file: 'moonlight-quest.sfc', system: 'snes', size: 1024 * 1024, example: true, addedAt: 1 },
    ],
    selectedSystem: 'gba',
    newestFirst: true,
    exporting: false,
    toastTimer: null,
  };

  // 2. Elementos e utilitários de interface
  const $ = (selector) => document.querySelector(selector);
  const els = {
    search: $('#search'), systemFilter: $('#systemFilter'), table: $('#tableWrap'),
    input: $('#fileInput'), drop: $('#drop'), modal: $('#modalBack'),
    exportButton: $('#exportBtn'), cancelButton: $('#cancel'), progress: $('#progress'),
    progressBar: $('#progressBar'), progressLabel: $('#progressLabel'),
    packageId: $('#packageId'), appName: $('#appName'), target: $('#target'),
    activity: $('#activity'), sortButton: $('#sortBtn'),
  };
  const encoder = new TextEncoder();
  const formatBytes = (bytes) => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const safeFileName = (name) => name
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_').replace(/^\.+/, '_').trim() || 'jogo.rom';

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function logActivity(title, detail, icon = '＋') {
    const item = document.createElement('div');
    item.className = 'activity';
    const iconElement = document.createElement('div');
    iconElement.className = 'act-icon';
    iconElement.textContent = icon;
    const description = document.createElement('p');
    description.append(document.createTextNode(title));
    const metadata = document.createElement('small');
    metadata.textContent = detail;
    description.append(metadata);
    item.append(iconElement, description);
    els.activity.prepend(item);
  }

  function render() {
    const query = els.search.value.trim().toLocaleLowerCase();
    const system = els.systemFilter.value;
    const visibleGames = state.games
      .filter((game) => system === 'all' || game.system === system)
      .filter((game) => `${game.name} ${game.file} ${game.system}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => (a.addedAt - b.addedAt) * (state.newestFirst ? -1 : 1));

    $('#statGames').textContent = String(state.games.length).padStart(2, '0');
    $('#statSize').textContent = formatBytes(state.games.reduce((total, game) => total + game.size, 0));
    $('#statSystems').textContent = String(new Set(state.games.map((game) => game.system)).size).padStart(2, '0');
    els.sortButton.textContent = state.newestFirst ? 'Mais recentes ↓' : 'Mais antigos ↑';

    if (!visibleGames.length) {
      els.table.innerHTML = '<div class="empty"><div class="big">⌕</div>Nenhum jogo encontrado.</div>';
      return;
    }

    els.table.innerHTML = `<table class="table"><thead><tr><th>JOGO</th><th>SISTEMA</th><th>TAMANHO</th><th>STATUS</th><th></th></tr></thead><tbody>${visibleGames.map((game) => {
      const systemInfo = SYSTEMS[game.system] || SYSTEMS.other;
      const status = game.example ? 'Exemplo' : 'Nesta sessão';
      return `<tr><td><div class="game"><div class="cover ${systemInfo.color}">${systemInfo.icon}</div><div><b>${escapeHtml(game.name)}</b><small>${escapeHtml(game.file)}</small></div></div></td><td><span class="tag">${systemInfo.label}</span></td><td>${formatBytes(game.size)}</td><td><span style="color:#a9d86b">●　${status}</span></td><td><button class="dots" data-remove="${state.games.indexOf(game)}" title="Remover" aria-label="Remover ${escapeHtml(game.name)}">···</button></td></tr>`;
    }).join('')}</tbody></table>`;
    els.table.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        state.games.splice(Number(button.dataset.remove), 1);
        render();
        showToast('Arquivo removido da lista.');
      });
    });
  }

  // 3. Importação e identificação de arquivos
  function identifySystem(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    if (extension === 'gba') return 'gba';
    if (extension === 'nes') return 'nes';
    if (['sfc', 'smc'].includes(extension)) return 'snes';
    if (['gb', 'gbc'].includes(extension)) return 'gb';
    return 'other';
  }

  function uniqueFileName(fileName, reservedNames) {
    const safeName = safeFileName(fileName);
    const dot = safeName.lastIndexOf('.');
    const base = dot > 0 ? safeName.slice(0, dot) : safeName;
    const extension = dot > 0 ? safeName.slice(dot) : '';
    let candidate = safeName;
    let suffix = 2;
    while (reservedNames.has(candidate.toLowerCase())) candidate = `${base} (${suffix++})${extension}`;
    reservedNames.add(candidate.toLowerCase());
    return candidate;
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList);
    const added = [];
    const rejected = [];
    const reservedNames = new Set(state.games.filter((game) => !game.example).map((game) => game.file.toLowerCase()));
    for (const file of files) {
      const extension = file.name.split('.').pop().toLowerCase();
      if (!file.size || !ALLOWED_EXTENSIONS.has(extension)) {
        rejected.push(file.name);
        continue;
      }
      const fileName = uniqueFileName(file.name, reservedNames);
      added.push({
        name: fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        file: fileName,
        size: file.size,
        system: identifySystem(fileName),
        blob: file,
        example: false,
        addedAt: Date.now() + added.length,
      });
    }
    state.games.unshift(...added.reverse());
    render();
    if (added.length) {
      const message = rejected.length
        ? `${added.length} arquivo(s) adicionado(s); ${rejected.length} rejeitado(s) por formato inválido ou vazio.`
        : `${added.length} arquivo(s) adicionado(s) à sessão.`;
      showToast(message);
      logActivity('Arquivos adicionados', `${added.length} arquivo(s) · sessão atual`);
    } else if (rejected.length) {
      showToast(`Formato não reconhecido ou arquivo vazio: ${rejected[0]}`);
    }
  }

  function setSelectedSystem(system) {
    state.selectedSystem = system;
    document.querySelectorAll('.platform').forEach((button) => {
      const selected = button.dataset.system.toLowerCase() === system;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const targetIndex = { gba: 0, nes: 1, snes: 2, other: 3 }[system] ?? 3;
    els.target.selectedIndex = targetIndex;
  }

  // 4. Eventos da interface
  els.search.addEventListener('input', render);
  els.systemFilter.addEventListener('change', render);
  $('#addBtn').addEventListener('click', () => els.input.click());
  $('#browseBtn').addEventListener('click', () => els.input.click());
  els.input.addEventListener('change', (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  });
  els.drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.drop.classList.add('over');
  });
  els.drop.addEventListener('dragleave', () => els.drop.classList.remove('over'));
  els.drop.addEventListener('drop', (event) => {
    event.preventDefault();
    els.drop.classList.remove('over');
    addFiles(event.dataTransfer.files);
  });
  document.querySelectorAll('.platform').forEach((button) => {
    button.addEventListener('click', () => setSelectedSystem(button.dataset.system.toLowerCase()));
  });
  els.target.addEventListener('change', () => {
    const systems = ['gba', 'nes', 'snes', 'other'];
    setSelectedSystem(systems[els.target.selectedIndex] || 'other');
  });
  $('#openBuild').addEventListener('click', () => {
    els.modal.classList.add('show');
    els.appName.focus();
  });
  els.cancelButton.addEventListener('click', () => {
    if (!state.exporting) {
      els.modal.classList.remove('show');
      $('#openBuild').focus();
    }
  });
  els.modal.addEventListener('click', (event) => {
    if (event.target === els.modal && !state.exporting) {
      els.modal.classList.remove('show');
      $('#openBuild').focus();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!els.modal.classList.contains('show')) return;
    if (event.key === 'Escape' && !state.exporting) {
      els.modal.classList.remove('show');
      $('#openBuild').focus();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = els.modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  els.sortButton.addEventListener('click', () => {
    state.newestFirst = !state.newestFirst;
    render();
  });
  $('#menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.querySelectorAll('.nav button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      $('#crumb').textContent = button.textContent.trim();
      $('#sidebar').classList.remove('open');
      if (button.dataset.page === 'builder') {
        els.modal.classList.add('show');
        els.appName.focus();
      } else if (button.dataset.page === 'activity') els.activity.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // 5. ZIP sem dependências, com limites ZIP32 e validação de caminhos.
  const uint16 = (value) => [value & 255, (value >>> 8) & 255];
  const uint32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  const crcTable = (() => {
    const table = [];
    for (let value = 0; value < 256; value += 1) {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      table[value] = crc >>> 0;
    }
    return table;
  })();
  function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function concatenate(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }
  async function makeZip(files) {
    if (files.length > 0xffff) throw new Error('O projeto contém muitos arquivos para ZIP32.');
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(await file.data.arrayBuffer());
      if (name.length > 0xffff || data.length > 0xffffffff || offset + data.length > 0xffffffff) {
        throw new Error('O projeto excede o limite de tamanho do formato ZIP.');
      }
      const crc = crc32(data);
      const local = concatenate([
        new Uint8Array([80, 75, 3, 4, ...uint16(20), ...uint16(0x800), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(crc), ...uint32(data.length), ...uint32(data.length), ...uint16(name.length), ...uint16(0)]),
        name, data,
      ]);
      localParts.push(local);
      centralParts.push(concatenate([
        new Uint8Array([80, 75, 1, 2, ...uint16(20), ...uint16(20), ...uint16(0x800), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(crc), ...uint32(data.length), ...uint32(data.length), ...uint16(name.length), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(offset)]),
        name,
      ]));
      offset += local.length;
    }
    const central = concatenate(centralParts);
    if (offset + central.length > 0xffffffff) throw new Error('O projeto excede o limite de tamanho do formato ZIP.');
    const end = new Uint8Array([80, 75, 5, 6, ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length), ...uint32(central.length), ...uint32(offset), ...uint16(0)]);
    return new Blob([...localParts, central, end], { type: 'application/zip' });
  }

  // 6. Montagem e download do projeto Android.
  const textFile = (value) => encoder.encode(value);
  const xmlEscape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
  const kotlinString = (value) => JSON.stringify(String(value)).replace(/\$/g, '\\$');

  function buildProjectFiles(name, applicationId, games) {
    const packagePath = applicationId.replace(/\./g, '/');
    const files = [
      { name: 'README.md', data: textFile(`# ${name}\n\nProjeto Android Studio gerado pelo ROMFOLIO.\n\n## Importante\nEste projeto contém os arquivos selecionados e um catálogo Android simples. **Ele não inclui um emulador**, portanto não executa os jogos. Integre um emulador compatível e licenciado para a plataforma antes de distribuir ou instalar como jogo. Use somente conteúdo próprio, homebrew ou autorizado. Verifique a legislação aplicável e as licenças de qualquer runtime.\n\n## Compilar\nAbra esta pasta no Android Studio, sincronize o Gradle e use Build > Build APK(s). Requer Android Studio com Android SDK instalado e conexão para baixar o plugin Gradle.\n\nOs arquivos ROM são copiados para app/src/main/assets/games/. O identificador configurado é ${applicationId}.\n`) },
      { name: 'settings.gradle.kts', data: textFile('pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = "ROMFolio"\ninclude(":app")\n') },
      { name: 'build.gradle.kts', data: textFile('plugins { id("com.android.application") version "8.7.3" apply false; id("org.jetbrains.kotlin.android") version "2.0.21" apply false }\n') },
      { name: 'app/build.gradle.kts', data: textFile(`plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }\n\nandroid { namespace = "${applicationId}"; compileSdk = 35\n defaultConfig { applicationId = "${applicationId}"; minSdk = 23; targetSdk = 35; versionCode = 1; versionName = "1.0" }\n}\n`) },
      { name: 'app/src/main/AndroidManifest.xml', data: textFile(`<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:theme="@android:style/Theme.Material.NoActionBar" android:label="${xmlEscape(name)}" android:usesCleartextTraffic="false"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>\n`) },
      { name: `app/src/main/java/${packagePath}/MainActivity.kt`, data: textFile(`package ${applicationId}\n\nimport android.app.Activity\nimport android.os.Bundle\nimport android.graphics.Color\nimport android.view.Gravity\nimport android.widget.LinearLayout\nimport android.widget.TextView\n\nclass MainActivity : Activity() {\n override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState)\n  val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32,48,32,32); setBackgroundColor(Color.rgb(16,18,15)) }\n  root.addView(TextView(this).apply { text = ${kotlinString(name)}; textSize = 25f; setTextColor(Color.rgb(200,241,105)) })\n  root.addView(TextView(this).apply { text = "Sua coleção"; textSize=16f; setTextColor(Color.WHITE); setPadding(0,24,0,12) })\n  val games = assets.list("games")?.filter { it.isNotBlank() } ?: emptyList()\n  if (games.isEmpty()) root.addView(TextView(this).apply { text="Nenhum arquivo encontrado."; setTextColor(Color.LTGRAY) })\n  games.forEach { game -> root.addView(TextView(this).apply { text="🎮  $game"; textSize=15f; setTextColor(Color.WHITE); setPadding(0,14,0,14) }) }\n  root.addView(TextView(this).apply { text="Para jogar, integre um emulador compatível e licenciado."; textSize=12f; setTextColor(Color.LTGRAY); gravity=Gravity.CENTER_VERTICAL; setPadding(0,20,0,0) })\n  setContentView(root)\n }\n}\n`) },
      { name: 'romfolio.json', data: textFile(JSON.stringify({
        name,
        applicationId,
        platform: els.target.value,
        createdAt: new Date().toISOString(),
        games: games.map((game) => ({ name: game.name, file: game.file, system: game.system, size: game.size })),
      }, null, 2)) },
    ];
    for (const game of games) {
      files.push({ name: `app/src/main/assets/games/${safeFileName(game.file)}`, data: game.blob });
    }
    return files;
  }

  els.exportButton.addEventListener('click', async () => {
    const games = state.games.filter((game) => !game.example && game.blob);
    if (!games.length) {
      showToast('Adicione arquivos próprios antes de exportar; exemplos não são incluídos.');
      return;
    }
    const name = els.appName.value.trim() || 'Minha coleção';
    const applicationId = els.packageId.value.trim() || 'com.exemplo.minhacolecao';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(applicationId)) {
      showToast('Use um identificador como com.exemplo.meuapp.');
      els.packageId.focus();
      return;
    }
    const totalBytes = games.reduce((total, game) => total + game.size, 0);
    if (totalBytes > MAX_EXPORT_BYTES) {
      showToast('O limite de exportação nesta página é 512 MB.');
      return;
    }

    state.exporting = true;
    els.exportButton.disabled = true;
    els.cancelButton.disabled = true;
    els.progress.classList.add('show');
    let progress = 0;
    const ticker = setInterval(() => {
      progress = Math.min(progress + 12, 82);
      els.progressBar.style.width = `${progress}%`;
      els.progressLabel.textContent = progress < 40 ? 'Organizando arquivos…' : progress < 75 ? 'Montando projeto Android…' : 'Preparando download…';
    }, 100);

    try {
      const zip = await makeZip(buildProjectFiles(name, applicationId, games));
      const url = URL.createObjectURL(zip);
      const download = document.createElement('a');
      download.href = url;
      download.download = 'romfolio-projeto-android.zip';
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      els.progressBar.style.width = '100%';
      els.progressLabel.textContent = 'Projeto exportado com sucesso.';
      showToast('Projeto Android exportado.');
      logActivity('Projeto Android exportado', `${games.length} arquivo(s) · ZIP`, '↓');
      setTimeout(() => {
        els.progress.classList.remove('show');
        els.progressBar.style.width = '0';
        els.modal.classList.remove('show');
        $('#openBuild').focus();
      }, 1200);
    } catch (error) {
      console.error('Falha ao criar o projeto ZIP:', error);
      els.progressLabel.textContent = 'Falha ao criar o pacote.';
      showToast(error.message || 'Não foi possível gerar o arquivo.');
      clearInterval(ticker);
      state.exporting = false;
      els.exportButton.disabled = false;
      els.cancelButton.disabled = false;
      return;
    }
    clearInterval(ticker);
    setTimeout(() => {
      state.exporting = false;
      els.exportButton.disabled = false;
      els.cancelButton.disabled = false;
    }, 1200);
  });

  // 7. Inicialização
  setSelectedSystem(state.selectedSystem);
  render();
})();
