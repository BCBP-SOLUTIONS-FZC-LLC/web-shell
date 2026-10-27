<#macro registrationLayout displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html lang="en" class="${properties.kcHtmlClass!}">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
</head>
<body class="${properties.kcBodyClass!}">
    <main class="bcbp-shell">
        <div class="bcbp-brand" aria-hidden="true">
            <img class="bcbp-brand-mark" src="${url.resourcesPath}/img/logo-white.png" alt="" />
          
        </div>

        <div class="bcbp-card">
            <div class="bcbp-card-accent" aria-hidden="true"></div>

            <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                <div class="bcbp-alert bcbp-alert-${message.type}" role="alert">
                    ${kcSanitize(message.summary)?no_esc}
                </div>
            </#if>

            <h1 class="bcbp-title"><#nested "header"></h1>

            <#nested "form">

            <#if displayInfo>
                <div class="bcbp-register">
                    <#nested "info">
                </div>
            </#if>
        </div>
    </main>
</body>
</html>
</#macro>
