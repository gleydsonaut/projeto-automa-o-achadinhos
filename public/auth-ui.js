import {icon} from './icons.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export const authMessages = {
  google_unavailable: 'O acesso com Google está indisponível no momento.',
  google_cancelled: 'O acesso com Google foi cancelado. Você pode tentar novamente.',
  google_failed: 'Não foi possível confirmar seu acesso com Google. Tente novamente.',
  invalid_state: 'A solicitação de acesso expirou ou não pertence a este navegador. Tente novamente.',
  invalid_request: 'Solicitação de acesso inválida. Tente novamente.',
  account_missing: 'Você ainda não criou uma conta com esse Google. Selecione “Criar conta”.',
  account_exists: 'Esse e-mail já tem uma conta. Entre com sua senha e vincule o Google em Configurações.',
  link_failed: 'Não foi possível vincular. Use a conta Google com o mesmo e-mail do seu cadastro.',
};

export function authMarkup({ mode = 'login', googleEnabled = false, notice = '' } = {}) {
  const register = mode === 'register';
  const registrationFields = register ? `<label>Nome<input name="name" autocomplete="name" required maxlength="120" placeholder="Seu nome"></label>` : '';
  const confirmation = register ? `<label>Confirmar senha<input name="passwordConfirmation" type="password" autocomplete="new-password" required minlength="12" maxlength="128" placeholder="Repita sua senha"></label>` : '';
  const google = googleEnabled ? `<a class="button google-signin" href="/auth/google/start?intent=${register ? 'register' : 'login'}">${register ? 'Criar conta com Google' : 'Entrar com Google'}</a><div class="auth-divider"><span>ou use seu e-mail</span></div>` : '';
  return `<main class="auth-layout"><section class="auth-story"><div class="brand large"><span class="brand-icon">${icon('mark')}</span><span translate="no">Oferta<span class="brand-light">Lab</span></span></div><div class="eyebrow">CURADORIA · AUTOMAÇÃO · DISTRIBUIÇÃO</div><h1>Toda boa oferta<br>merece chegar<br>mais longe.</h1><p>Um só espaço para organizar seus produtos, preparar mensagens e dar ritmo à sua operação.</p><div class="auth-art" aria-hidden="true"><div>${icon('products')}<span>Produtos selecionados</span></div><div>${icon('coupons')}<span>Cupons organizados</span></div><div>${icon('automations')}<span>Rotinas bem definidas</span></div><div>${icon('groups')}<span>Ofertas no destino certo</span></div></div><div class="auth-signature">Menos tarefas soltas. Mais clareza.</div></section><section class="auth-panel"><div class="auth-card"><div class="eyebrow">${register ? 'COMECE AQUI' : 'BEM-VINDO DE VOLTA'}</div><h2>${register ? 'Crie sua conta' : 'Entre na sua conta'}</h2><p>${register ? 'Preencha seus dados para começar.' : 'Acesse sua operação de ofertas.'}</p>${google}<form id="auth-form">${registrationFields}<label>E-mail<input name="email" type="email" autocomplete="username" required maxlength="254" placeholder="voce@exemplo.com"></label><label>Senha<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="${register ? 12 : 1}" maxlength="128" placeholder="${register ? 'Pelo menos 12 caracteres' : 'Sua senha'}"></label>${confirmation}<p id="auth-error" class="auth-error" role="alert" aria-live="polite" ${notice ? '' : 'hidden'}>${escape(notice)}</p><button class="button primary full" id="auth-submit">${register ? 'Criar conta' : 'Entrar'}</button></form><button class="text-button" id="auth-switch">${register ? 'Já tem uma conta? Entrar' : 'Ainda não tem conta? Criar conta'}</button></div></section></main>`;
}

export function mountAuth({ app, state, api, onSuccess }) {
  document.body.classList.remove('menu-is-open','has-dialog');
  app.innerHTML = authMarkup({ mode: state.authMode, googleEnabled: state.authProviders?.google?.enabled, notice: state.authNotice });
  document.querySelector('#auth-switch').onclick = () => {
    state.authMode = state.authMode === 'register' ? 'login' : 'register';
    state.authNotice = '';
    mountAuth({ app, state, api, onSuccess });
  };
  const form = document.querySelector('#auth-form');
  form.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const error = document.querySelector('#auth-error');
    const button = document.querySelector('#auth-submit');
    error.hidden = true;
    if (state.authMode === 'register' && data.password !== data.passwordConfirmation) {
      error.textContent = 'A confirmação da senha deve ser igual à senha.'; error.hidden = false;form.elements.passwordConfirmation.focus();return;
    }
    button.disabled = true;
    button.textContent = state.authMode === 'register' ? 'Criando conta…' : 'Entrando…';
    try {
      state.user = (await api(state.authMode === 'register' ? 'register' : 'login', { method: 'POST', body: JSON.stringify(data) })).user;
      form.reset();
      await onSuccess();
    } catch (cause) {
      error.textContent = cause.message; error.hidden = false;
    } finally {
      button.disabled = false; button.textContent = state.authMode === 'register' ? 'Criar conta' : 'Entrar';
    }
  };
}
