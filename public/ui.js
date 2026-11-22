const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
export const icon = name => '<span aria-hidden="true" class="ico ico-' + name + '"></span>';
export const arrow = '<span class="arrow" aria-hidden="true">→</span>';
export const disabled = condition => condition ? ' disabled' : '';
export const hint = text => '<p class="form-error" role="alert">' + esc(text) + '</p>';
export const avatar = index => '<span class="avatar avatar-' + (index % 6) + '" aria-hidden="true"><i></i></span>';
export const gameArt = () => `
  <div class="poster-art" aria-hidden="true">
    <div class="art-scene">
      <div class="art-board"></div><div class="art-ring"></div>
      <div class="art-spark spark-one"></div><div class="art-spark spark-two"></div>
      <div class="art-disc disc-one"></div><div class="art-disc disc-two"></div>
      <div class="art-tile tile-g"><b>G</b><i></i></div>
      <div class="art-tile tile-r"><b>R</b><i></i></div>
      <div class="art-tile tile-a"><b>A</b><i></i></div>
      <div class="art-dots"></div>
    </div>
  </div>`;

export function playerList(state) {
  return `<ul class="players">${state.players.map((p, i) => `<li>
    ${avatar(i)}<span class="player-name">${esc(p.name)}${p.id === state.me ? '<small> (Ty)</small>' : ''}</span>
    ${p.id === state.hostId ? '<span class="tag">Gospodarz</span>' : ''}
    ${!p.online ? '<span class="muted small">Poza siecią</span>' : ''}
    </li>`).join('')}</ul>`;
}
