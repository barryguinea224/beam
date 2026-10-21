'use strict';

const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
const siteHeader = document.querySelector('.site-header');

function closeMenu() {
  if (!menuToggle || !mainNav) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Ouvrir le menu');
  mainNav.classList.remove('open');
  document.body.classList.remove('menu-is-open');
}

if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Ouvrir le menu' : 'Fermer le menu');
    mainNav.classList.toggle('open', !isOpen);
    document.body.classList.toggle('menu-is-open', !isOpen);
  });
  mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  window.matchMedia('(min-width: 921px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
}

let lastScrollState = false;
window.addEventListener('scroll', () => {
  const next = window.scrollY > 30;
  if (next !== lastScrollState && siteHeader) {
    siteHeader.classList.toggle('header-scrolled', next);
    lastScrollState = next;
  }
}, { passive: true });

const serviceSelect = document.getElementById('service-select');
document.querySelectorAll('[data-service]').forEach(link => {
  link.addEventListener('click', () => {
    if (serviceSelect) serviceSelect.value = link.dataset.service;
  });
});

const terminalExamples = {
  AN: {
    command: 'AN15NOVCKYCDG',
    lines: ['SIMULATION DE DISPONIBILITÉ', 'CKY → CDG / 15 NOV', '01  VOL D’EXEMPLE · CLASSE Y', '02  APPRENEZ LES COMMANDES GDS']
  },
  NM: {
    command: 'NM1DIALLO/AMADOU MR',
    lines: ['SIMULATION DE DOSSIER PNR', 'ÉLÉMENT PASSAGER AJOUTÉ', '01  DIALLO/AMADOU MR', 'COMMANDE RECONNUE : NM']
  },
  FXP: {
    command: 'FXP',
    lines: ['SIMULATION DE TARIFICATION', 'TARIF D’ENTRAÎNEMENT UNIQUEMENT', '01  AUCUN TARIF RÉEL AFFICHÉ', 'COMMANDE RECONNUE : FXP']
  }
};

const terminalCommand = document.getElementById('terminal-command');
const terminalOutput = document.getElementById('terminal-output');
document.querySelectorAll('.terminal-choice').forEach(button => {
  button.addEventListener('click', () => {
    const example = terminalExamples[button.dataset.demo];
    if (!example || !terminalCommand || !terminalOutput) return;
    document.querySelectorAll('.terminal-choice').forEach(other => {
      other.classList.toggle('active', other === button);
      other.setAttribute('aria-pressed', String(other === button));
    });
    terminalCommand.textContent = example.command;
    terminalOutput.replaceChildren();
    example.lines.forEach((line, index) => {
      const p = document.createElement('p');
      if (index >= 2) {
        const match = line.match(/^(\d\d)\s+(.*)/);
        if (match) {
          const span = document.createElement('span');
          span.className = 'terminal-accent';
          span.textContent = match[1];
          p.append(span, document.createTextNode(' ' + match[2]));
        } else p.textContent = line;
      } else p.textContent = line;
      terminalOutput.append(p);
    });
  });
});

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// A static site opened from a local disk cannot submit to Netlify Forms.
// Prevent a confusing redirect during offline preview; submissions will work once deployed to Netlify.
const contactForm = document.getElementById('contact-form');
if (contactForm && window.location.protocol === 'file:') {
  contactForm.addEventListener('submit', event => {
    event.preventDefault();
    window.alert('Aperçu local : le formulaire sera opérationnel après publication du site sur Netlify.');
  });
}
