// Account page behaviour.
//
// Every request here goes to nose's own origin. No third-party script loads on
// this page and no SDK is involved, which is why the Content Security Policy
// needed no amendment for accounts. Keep it that way: if a future change wants
// `connect-src` widened, that is a signal the design has drifted, not a small
// config tweak.
//
// No inline handlers anywhere — build.sh fails the build on inline script, and
// `script-src 'self'` would block it in the browser regardless.

(function () {
  'use strict';

  var API = '/.netlify/functions';

  function $(id) { return document.getElementById(id); }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function message(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
    el.hidden = !text;
  }

  function busy(button, isBusy, labelWhenBusy) {
    if (!button) return;
    if (isBusy) {
      button.dataset.label = button.textContent;
      if (labelWhenBusy) button.textContent = labelWhenBusy;
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
    } else {
      if (button.dataset.label) button.textContent = button.dataset.label;
      button.removeAttribute('aria-busy');
      button.disabled = false;
    }
  }

  // Always returns { ok, status, data } — never throws, so no call site has to
  // guard against a rejected promise on a flaky connection.
  function post(path, payload) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () {
      return { ok: false, status: 0, data: { message: 'Network problem. Check your connection and try again.' } };
    });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ------------------------------------------------------------- rendering

  function renderSignedIn(data) {
    $('acct-email').textContent = data.email || '—';
    $('acct-created').textContent = formatDate(data.createdAt);
    $('acct-plan').textContent = data.subscription === 'active' ? 'Paid' : 'Free';
    $('acct-expires').textContent = formatDate(data.sessionExpiresAt);

    show($('acct-loading'), false);
    show($('state-signedout'), false);
    show($('state-signedin'), true);

    if (data.degraded) {
      message($('session-message'),
        'We could not reach the account service just now, so your plan may be shown incorrectly. Your session is fine.',
        null);
    }
  }

  function renderSignedOut() {
    show($('acct-loading'), false);
    show($('state-signedin'), false);
    show($('state-signedout'), true);
  }

  function refresh() {
    return fetch(API + '/auth-me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.signedIn) renderSignedIn(data);
        else renderSignedOut();
      })
      .catch(function () {
        // Fail to the signed-out view: a login form is usable, a spinner is not.
        renderSignedOut();
      });
  }

  // ----------------------------------------------------------------- tabs

  function selectTab(which) {
    var login = which === 'login';
    $('tab-login').setAttribute('aria-selected', String(login));
    $('tab-signup').setAttribute('aria-selected', String(!login));
    show($('panel-login'), login);
    show($('panel-signup'), !login);
    show($('panel-reset'), false);
  }

  // ----------------------------------------------------------------- wire

  function init() {
    $('tab-login').addEventListener('click', function () { selectTab('login'); });
    $('tab-signup').addEventListener('click', function () { selectTab('signup'); });

    $('show-reset').addEventListener('click', function () {
      show($('panel-login'), false);
      show($('panel-signup'), false);
      show($('panel-reset'), true);
      $('reset-email').value = $('login-email').value;
      $('reset-email').focus();
    });

    $('hide-reset').addEventListener('click', function () { selectTab('login'); });

    // --- sign in
    function doLogin() {
      var btn = $('login-submit');
      var email = $('login-email').value.trim();
      var password = $('login-password').value;

      if (!email || !password) {
        message($('login-message'), 'Enter your email and password.', 'error');
        return;
      }

      message($('login-message'), '', null);
      busy(btn, true, 'Signing in…');

      post('/auth-login', { email: email, password: password }).then(function (res) {
        busy(btn, false);
        if (res.ok) {
          $('login-password').value = '';
          refresh();
          return;
        }
        message($('login-message'),
          (res.data && res.data.message) || 'Sign in failed. Try again.',
          'error');
      });
    }

    $('login-submit').addEventListener('click', doLogin);
    $('login-password').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });

    // --- create account
    $('signup-submit').addEventListener('click', function () {
      var btn = $('signup-submit');
      var email = $('signup-email').value.trim();
      var password = $('signup-password').value;

      if (!email) {
        message($('signup-message'), 'Enter your email address.', 'error');
        return;
      }
      if (password.length < 10) {
        message($('signup-message'), 'Your password needs at least 10 characters.', 'error');
        return;
      }
      if (!$('signup-age').checked) {
        message($('signup-message'), 'Please confirm you are 21 or over.', 'error');
        return;
      }

      message($('signup-message'), '', null);
      busy(btn, true, 'Creating…');

      post('/auth-signup', { email: email, password: password, ageAttested: true })
        .then(function (res) {
          busy(btn, false);
          if (res.ok) {
            $('signup-password').value = '';
            // The server answers identically whether or not the address was
            // already registered, so this message must stay identical too —
            // varying it here would undo the enumeration resistance the
            // endpoint was written to provide.
            message($('signup-message'),
              (res.data && res.data.message) || 'Check your email to finish setting up your account.',
              'ok');
            // If confirmation is disabled server-side a session already exists.
            setTimeout(refresh, 600);
            return;
          }
          message($('signup-message'),
            (res.data && res.data.message) || 'That did not work. Check the address and try again.',
            'error');
        });
    });

    // --- reset
    $('reset-submit').addEventListener('click', function () {
      var btn = $('reset-submit');
      var email = $('reset-email').value.trim();
      if (!email) {
        message($('reset-message'), 'Enter your email address.', 'error');
        return;
      }
      busy(btn, true, 'Sending…');
      post('/auth-reset', { email: email }).then(function (res) {
        busy(btn, false);
        message($('reset-message'),
          (res.data && res.data.message) || 'If that address has an account, a reset link is on its way.',
          'ok');
      });
    });

    // --- log out
    $('logout').addEventListener('click', function () {
      var btn = $('logout');
      busy(btn, true, 'Signing out…');
      post('/auth-logout', {}).then(function () {
        busy(btn, false);
        message($('session-message'), '', null);
        refresh();
      });
    });

    $('logout-all').addEventListener('click', function () {
      var btn = $('logout-all');
      busy(btn, true, 'Signing out…');
      post('/auth-logout', { everywhere: true }).then(function () {
        busy(btn, false);
        message($('session-message'), '', null);
        refresh();
      });
    });

    // --- delete
    var confirmField = $('delete-confirm');
    var deleteBtn = $('delete-submit');

    confirmField.addEventListener('input', function () {
      deleteBtn.disabled = confirmField.value.trim() !== 'DELETE';
    });

    deleteBtn.addEventListener('click', function () {
      if (confirmField.value.trim() !== 'DELETE') return;

      busy(deleteBtn, true, 'Deleting…');
      post('/account-delete', { confirm: 'DELETE' }).then(function (res) {
        busy(deleteBtn, false);
        deleteBtn.disabled = true;
        confirmField.value = '';

        if (res.ok && res.data && res.data.status === 'deleted') {
          message($('delete-message'), 'Your account and any synced data have been erased.', 'ok');
          setTimeout(refresh, 1200);
          return;
        }

        // A partial failure must not read as success — the privacy page
        // promises deletion means deletion, so a half-done run gets said out
        // loud and followed up by hand.
        message($('delete-message'),
          (res.data && res.data.message) || 'Deletion did not complete. Please contact us so we can finish it.',
          'error');
      });
    });

    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
