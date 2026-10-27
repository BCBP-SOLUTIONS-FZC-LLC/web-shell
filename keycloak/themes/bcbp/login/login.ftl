<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        Sign in to your account
    <#elseif section = "form">
        <#if realm.password>
            <form id="kc-form-login" class="bcbp-form" action="${url.loginAction}" method="post" onsubmit="login.disabled = true; return true;">
                <#if !usernameHidden??>
                    <div class="bcbp-field">
                        <label for="username">Email</label>
                        <input
                            tabindex="1"
                            id="username"
                            name="username"
                            value="${(login.username!'')}"
                            type="text"
                            autofocus
                            autocomplete="username"
                            aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                        />
                        <#if messagesPerField.existsError('username','password')>
                            <span class="bcbp-field-error" aria-live="polite">
                                ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                            </span>
                        </#if>
                    </div>
                </#if>

                <div class="bcbp-field">
                    <label for="password">Password</label>
                    <div class="bcbp-password-wrap">
                        <input
                            tabindex="2"
                            id="password"
                            name="password"
                            type="password"
                            autocomplete="current-password"
                            aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                        />
                        <button
                            type="button"
                            class="bcbp-password-toggle"
                            tabindex="-1"
                            aria-label="Show password"
                            onclick="bcbpTogglePassword(this)"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="bcbp-row">
                    <#if realm.rememberMe && !usernameHidden??>
                        <label class="bcbp-check">
                            <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if> />
                            Remember me
                        </label>
                    </#if>
                    <#if realm.resetPasswordAllowed>
                        <a class="bcbp-link" tabindex="5" href="${url.loginResetCredentialsUrl}">Forgot Password?</a>
                    </#if>
                </div>

                <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />

                <button tabindex="4" class="bcbp-submit" name="login" id="kc-login" type="submit">Sign In</button>
            </form>
        </#if>
    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <span class="bcbp-muted">New user?</span>
            <a class="bcbp-link" tabindex="6" href="${url.registrationUrl}">Register</a>
        </#if>
    </#if>
</@layout.registrationLayout>

<script>
function bcbpTogglePassword(button) {
  var input = document.getElementById('password');
  if (!input) return;
  var show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}
</script>
