/* Minimal Pokédex for Gens I–III using PokeAPI */
(function() {
  const gridEl = document.getElementById('grid');
  const statusEl = document.getElementById('status');
  const modalEl = document.getElementById('modal');
  const modalBodyEl = document.getElementById('modal-body');
  const searchEl = document.getElementById('search');
  const typeFilterEl = document.getElementById('type-filter');
  const genFilterEl = document.getElementById('gen-filter');

  const GENERATION_RANGES = [
    { name: 'Kanto', start: 1, end: 151 },
    { name: 'Johto', start: 152, end: 251 },
    { name: 'Hoenn', start: 252, end: 386 }
  ];

  const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
  const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;


  const CACHE_KEY = 'pokedex_g1_3_v1';
  const FILTERS_KEY = 'pokedex_filters_v2';
  let fullData = [];
  let currentQuery = '';
  let currentType = '';
  let currentGen = '';

  init();

  async function init() {
    try {
      // Inicializar tema por defecto
      changeRegionTheme('kanto');
      
      const cached = readCache();
      if (cached) {
        fullData = cached;
        restoreFilters();
        applyFilters();
        statusEl.textContent = `Cargado desde caché (${cached.length} Pokémon)`;
        // Refresh in background
        refreshData();
        return;
      }
      const data = await fetchAllPokemon();
      fullData = data;
      writeCache(data);
      restoreFilters();
      applyFilters();
      statusEl.textContent = `Listo (${data.length} Pokémon)`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Ocurrió un error al cargar los datos.';
    }
  }


  function readCache() {
    try {
      const text = localStorage.getItem(CACHE_KEY);
      if (!text) return null;
      return JSON.parse(text);
    } catch (_) { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  async function refreshData() {
    try {
      const data = await fetchAllPokemon();
      writeCache(data);
      fullData = data;
      applyFilters();
      // Optionally re-render or show small notice
    } catch (_) {}
  }

  function getIdFromUrl(url) {
    const parts = url.split('/').filter(Boolean);
    return Number(parts[parts.length - 1]);
  }

  function rangeIds() {
    const ids = [];
    for (const r of GENERATION_RANGES) {
      for (let i = r.start; i <= r.end; i++) ids.push(i);
    }
    return ids;
  }

  async function fetchAllPokemon() {
    const ids = rangeIds();
    // Concurrency limit to avoid hammering API
    const CONCURRENCY = 12;
    const results = new Array(ids.length);
    let index = 0;

    async function worker() {
      while (index < ids.length) {
        const current = index++;
        const id = ids[current];
        results[current] = await fetchOnePokemon(id);
        if (current % 20 === 0) {
          statusEl.textContent = `Cargando… ${current + 1}/${ids.length}`;
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return results.filter(Boolean);
  }

  async function fetchOnePokemon(id) {
    try {
      const [pokemonRes, speciesRes] = await Promise.all([
        fetch(`${POKEAPI_BASE}/pokemon/${id}`),
        fetch(`${POKEAPI_BASE}/pokemon-species/${id}`)
      ]);
      if (!pokemonRes.ok || !speciesRes.ok) return null;
      const pokemon = await pokemonRes.json();
      const species = await speciesRes.json();

      const types = pokemon.types.map(t => t.type.name);
      const genders = genderFromSpecies(species);
      const description = getSpanishFlavor(species) || 'Descripción no disponible.';
      const generation = generationFromId(id);
      const isLegendary = !!species.is_legendary;
      return {
        id,
        name: pokemon.name,
        types,
        genders,
        description,
        image: SPRITE(id),
        generation,
        isLegendary
      };
    } catch (e) {
      return null;
    }
  }

  function getSpanishFlavor(species) {
    const entry = (species.flavor_text_entries || []).find(e => e.language?.name === 'es');
    if (!entry) return null;
    return entry.flavor_text.replace(/\f|\n|\r/g, ' ').trim();
  }

  function genderFromSpecies(species) {
    const rate = species.gender_rate; // -1 genderless; 0 all male; 8 all female
    if (rate === -1) return ['Sin género'];
    if (rate === 0) return ['Macho'];
    if (rate === 8) return ['Hembra'];
    return ['Macho', 'Hembra'];
  }

  function renderAll(list) {
    gridEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const p of list) {
      fragment.appendChild(renderCard(p));
    }
    gridEl.appendChild(fragment);
  }

  function applyFilters() {
    const q = currentQuery.trim().toLowerCase();
    const type = currentType;
    const gen = currentGen;
    let list = fullData;
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    if (type) list = list.filter(p => p.types.includes(type));
    if (gen) list = list.filter(p => p.generation === gen);
    renderAll(list);
    statusEl.textContent = `Mostrando ${list.length} de ${fullData.length}`;
  }

  function renderCard(p) {
    const li = document.createElement('article');
    const primaryType = p.types[0];
    li.className = `card type-${primaryType}`;
    li.setAttribute('role', 'listitem');
    li.tabIndex = 0;
    li.innerHTML = `
      <button class="audio-button" aria-label="Reproducir grito de ${capitalize(p.name)}" data-pokemon-id="${p.id}">🔊</button>
      <div class="card-header">
        <span class="dex-number">#${String(p.id).padStart(3, '0')}</span>
        ${p.isLegendary ? '<span class="legendary-badge">Legendario</span>' : ''}
      </div>
      <img src="${p.image}" alt="${capitalize(p.name)}" loading="lazy"/>
      <div class="name">${capitalize(p.name)}</div>
      <div class="types">${p.types.map(t => `<span class="type ${t}">${translateType(t)}</span>`).join('')}</div>
      <div class="meta">${renderGenders(p.genders)}</div>
      <p class="description">${p.description}</p>
    `;

    // Event listener para el modal (evitar que se active al hacer clic en el botón de audio)
    li.addEventListener('click', (e) => {
      if (!e.target.closest('.audio-button')) {
        openModal(p);
      }
    });
    li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openModal(p); });
    
    // Event listener para el botón de audio
    const audioButton = li.querySelector('.audio-button');
    audioButton.addEventListener('click', (e) => {
      e.stopPropagation();
      playPokemonCry(p.id, audioButton);
    });
    
    return li;
  }

  function openModal(p) {
    modalBodyEl.innerHTML = `
      <div style="display:flex; gap:16px; align-items:flex-start;">
        <img src="${p.image}" alt="${capitalize(p.name)}" style="width:160px; height:160px; object-fit:contain;"/>
        <div>
          <div class="dex-number">#${String(p.id).padStart(3, '0')}</div>
          <h4 class="name" style="margin:4px 0 8px">${capitalize(p.name)}</h4>
          <div class="types" style="margin:6px 0 8px">${p.types.map(t => `<span class=\"type ${t}\">${translateType(t)}</span>`).join('')}</div>
          <div class="meta">Género: ${renderGenders(p.genders)} ${p.isLegendary ? ' · <span class=\"legendary-badge\">Legendario</span>' : ''}</div>
          <p class="description">${p.description}</p>
        </div>
      </div>
    `;
    modalEl.setAttribute('aria-hidden', 'false');
  }

  modalEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.getAttribute('aria-hidden') === 'false') closeModal();
  });
  function closeModal() { modalEl.setAttribute('aria-hidden', 'true'); }

  function translateType(t) {
    const map = {
      normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dark: 'Siniestro', dragon: 'Dragón', steel: 'Acero', fairy: 'Hada'
    };
    return map[t] || t;
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function renderGenders(genders) {
    if (genders.includes('Sin género')) return 'Sin género';
    const parts = [];
    if (genders.includes('Macho')) parts.push('<span class="gender"><span class="male">♂</span></span>');
    if (genders.includes('Hembra')) parts.push('<span class="gender"><span class="female">♀</span></span>');
    return parts.join(' ');
  }

  // Wire filters
  if (searchEl) {
    searchEl.addEventListener('input', (e) => { currentQuery = e.target.value || ''; saveFilters(); applyFilters(); });
  }
  if (typeFilterEl) {
    typeFilterEl.addEventListener('change', (e) => { currentType = e.target.value || ''; saveFilters(); applyFilters(); });
  }
  if (genFilterEl) {
    genFilterEl.addEventListener('change', (e) => { 
      const newGen = e.target.value || '';
      const oldGen = currentGen;
      currentGen = newGen; 
      saveFilters(); 
      applyFilters();
      
      // Mostrar alerta solo si se selecciona una región (no cuando se deselecciona)
      if (newGen && newGen !== oldGen) {
        showRegionAlert(newGen);
        changeRegionTheme(newGen);
      } else if (!newGen) {
        changeRegionTheme('kanto'); // Default
      }
    });
  }

  function saveFilters() {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ q: currentQuery, type: currentType, gen: currentGen })); } catch (_) {}
  }
  function restoreFilters() {
    try {
      const text = localStorage.getItem(FILTERS_KEY);
      if (!text) return;
      const obj = JSON.parse(text);
      currentQuery = obj.q || '';
      currentType = obj.type || '';
      currentGen = obj.gen || '';
      if (searchEl) searchEl.value = currentQuery;
      if (typeFilterEl) typeFilterEl.value = currentType;
      if (genFilterEl) genFilterEl.value = currentGen;
    } catch (_) {}
  }

  function generationFromId(id) {
    if (id >= 1 && id <= 151) return 'kanto';
    if (id >= 152 && id <= 251) return 'johto';
    if (id >= 252 && id <= 386) return 'hoenn';
    return '';
  }

  

  // Función para reproducir el cry del Pokémon
  async function playPokemonCry(pokemonId, button) {
    try {
      // Agregar clase de reproducción
      button.classList.add('playing');
      button.textContent = '⏸️';
      
      // URL del cry desde PokeAPI
      const cryUrl = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${pokemonId}.ogg`;
      
      // Crear elemento de audio
      const audio = new Audio(cryUrl);
      
      // Event listeners para el audio
      audio.addEventListener('loadstart', () => {
        button.textContent = '⏳';
      });
      
      audio.addEventListener('canplay', () => {
        button.textContent = '🔊';
      });
      
      audio.addEventListener('ended', () => {
        button.classList.remove('playing');
        button.textContent = '🔊';
      });
      
      audio.addEventListener('error', () => {
        button.classList.remove('playing');
        button.textContent = '🔊';
        console.warn(`No se pudo cargar el cry del Pokémon ${pokemonId}`);
      });
      
      // Reproducir el audio
      await audio.play();
      
    } catch (error) {
      console.error('Error al reproducir el cry:', error);
      button.classList.remove('playing');
      button.textContent = '🔊';
    }
  }

  // Función para mostrar alertas de región
  function showRegionAlert(region) {
    const regionData = {
      kanto: {
        title: '✨ ¡Bienvenido a Kanto!',
        text: 'La región donde comenzó todo. ¡Explora los 151 Pokémon originales!',
        icon: '✨',
        color: '#ff6b6b'
      },
      johto: {
        title: '🌿 ¡Bienvenido a Johto!',
        text: 'Una tierra de tradición y misterio. ¡Descubre los Pokémon de la segunda generación!',
        icon: '🌿',
        color: '#4ecdc4'
      },
      hoenn: {
        title: '🔥 ¡Bienvenido a Hoenn!',
        text: 'Una región de contrastes entre tierra y mar. ¡Conoce los Pokémon de la tercera generación!',
        icon: '🔥',
        color: '#45b7d1'
      }
    };

    const data = regionData[region];
    if (data) {
      Swal.fire({
        title: data.title,
        text: data.text,
        icon: 'success',
        iconColor: data.color,
        confirmButtonText: '¡Explorar!',
        confirmButtonColor: data.color,
        background: '#ffffff',
        customClass: {
          popup: 'swal-region-popup'
        }
      });
    }
  }

  // Función para cambiar el tema de la región (fondo y medallas)
  function changeRegionTheme(region) {
    const regionBg = document.getElementById('region-bg');
    const badgesLeft = document.getElementById('gym-badges-left');
    const badgesRight = document.getElementById('gym-badges-right');

    if (!regionBg || !badgesLeft || !badgesRight) return;

    // Cambiar fondo
    regionBg.className = `region-background ${region}-bg`;

    // Definir medallas por región con imágenes oficiales (URLs corregidas)
    const regionBadges = {
      kanto: [
        { image: 'https://archives.bulbagarden.net/media/upload/7/7b/Boulder_Badge.png', name: 'Boulder' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Cascade_Badge.png', name: 'Cascade' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Thunder_Badge.png', name: 'Thunder' },
        { image: 'https://archives.bulbagarden.net/media/upload/0/0a/Rainbow_Badge.png', name: 'Rainbow' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Soul_Badge.png', name: 'Soul' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Marsh_Badge.png', name: 'Marsh' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Volcano_Badge.png', name: 'Volcano' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Earth_Badge.png', name: 'Earth' }
      ],
      johto: [
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Zephyr_Badge.png', name: 'Zephyr' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Hive_Badge.png', name: 'Hive' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Plain_Badge.png', name: 'Plain' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Fog_Badge.png', name: 'Fog' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Storm_Badge.png', name: 'Storm' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Mineral_Badge.png', name: 'Mineral' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Glacier_Badge.png', name: 'Glacier' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Rising_Badge.png', name: 'Rising' }
      ],
      hoenn: [
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Stone_Badge.png', name: 'Stone' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Knuckle_Badge.png', name: 'Knuckle' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Dynamo_Badge.png', name: 'Dynamo' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Heat_Badge.png', name: 'Heat' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Balance_Badge.png', name: 'Balance' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Feather_Badge.png', name: 'Feather' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Mind_Badge.png', name: 'Mind' },
        { image: 'https://archives.bulbagarden.net/media/upload/8/8b/Rain_Badge.png', name: 'Rain' }
      ]
    };

    const badges = regionBadges[region] || regionBadges.kanto;

    // Actualizar medallas izquierdas
    badgesLeft.innerHTML = badges.map(badge => 
      `<div class="badge ${region}-badge" data-badge="${badge.name.toLowerCase()}" title="${badge.name} Badge">
        <img src="${badge.image}" alt="${badge.name} Badge" style="width: 40px; height: 40px; object-fit: contain;" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div style="display: none; width: 40px; height: 40px; align-items: center; justify-content: center; font-size: 20px; color: #666;">
          🏆
        </div>
      </div>`
    ).join('');

    // Actualizar medallas derechas
    badgesRight.innerHTML = badges.map(badge => 
      `<div class="badge ${region}-badge" data-badge="${badge.name.toLowerCase()}" title="${badge.name} Badge">
        <img src="${badge.image}" alt="${badge.name} Badge" style="width: 40px; height: 40px; object-fit: contain;" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div style="display: none; width: 40px; height: 40px; align-items: center; justify-content: center; font-size: 20px; color: #666;">
          🏆
        </div>
      </div>`
    ).join('');
  }
})();


