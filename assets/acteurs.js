"use strict";
const actorInput = document.getElementById('actor-search');
const actorCards = [...document.querySelectorAll('.actor-card')];
const actorButtons = [...document.querySelectorAll('.actor-filter')];
const actorCount = document.getElementById('actor-count');
const actorEmpty = document.getElementById('actor-empty');
let selected = 'all';
function updateDirectory() {
  const value = (actorInput?.value || '').trim().toLocaleLowerCase('fr');
  let count = 0;
  for (const card of actorCards) {
    const visible = (selected === 'all' || card.dataset.category === selected) && card.dataset.search.includes(value);
    card.hidden = !visible;
    if (visible) count++;
  }
  if (actorCount) actorCount.textContent = `${count} ressource${count===1?'':'s'} affichée${count===1?'':'s'}`;
  if (actorEmpty) actorEmpty.hidden = count !== 0;
}
actorInput?.addEventListener('input', updateDirectory);
actorButtons.forEach(button => button.addEventListener('click', () => {
  selected = button.dataset.filter;
  actorButtons.forEach(b => {
    const current = b === button;
    b.classList.toggle('selected',current);
    b.setAttribute('aria-pressed',String(current));
  });
  updateDirectory();
}));
