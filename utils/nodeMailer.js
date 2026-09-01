const nodemailer = require("nodemailer");
const setup = require("../config/setup.json");

// Where the reset link points. This was setup.weblink, a value committed to
// the repository, and it still named the retired Heroku host - so after any
// move the mail would send, the API would answer 200, and the link in it would
// go nowhere. It belongs in the environment, where it moves with the
// deployment. server.js refuses to start in production without it.
const APP_URL = process.env.APP_URL || "http://localhost:3001";

// The SMTP host, from the environment rather than from config/setup.json.
//
// setup.json named smtp.gmail.com - a decision about where the app is deployed
// sitting in a committed file. It also cannot work on Render's free tier,
// which blocks outbound SMTP on the ports Gmail listens on, so password reset
// has been dead in production while the code looked fine.
//
// Everything another provider needs is a variable now, so moving to one is
// configuration rather than an edit here. EMAIL_USER and EMAIL_PASSWORD are
// still read as fallbacks, so an existing deployment keeps working untouched.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
// Required, with no fallback. It used to default to setup.senderEmail - an
// address committed to this repo, and not one the provider has verified. A
// provider accepts a message from an unverified sender and then never
// delivers it, so that default turned a missing variable into mail that
// vanished silently: the same failure this whole change set out to remove.
// isConfigured checks it, so a deployment missing it says so on boot.
const MAIL_FROM = process.env.MAIL_FROM;

// Brevo's HTTP API, and the reason it exists.
//
// Render blocks outbound SMTP from free services on 25, 465 and 587 - the ban
// is on the ports, not on any one provider, so no SMTP host can be reached
// from there however it is configured. Measured rather than assumed: a reset
// request against the deployed app sat for 120 seconds and then failed, which
// is a connection going nowhere rather than one being refused.
//
// This path is ordinary HTTPS on 443, which Render allows like any other
// outbound call. When BREVO_API_KEY is set it is used in preference to SMTP.
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// 465 is implicit TLS; 587 starts plain and negotiates with STARTTLS.
const SMTP_SECURE = SMTP_PORT === 465;

// Failure has to be quick. nodemailer waits two minutes by default, and this
// runs before the response is sent - so a blocked port turned a reset request
// into a two minute hang holding a worker open on a free instance that only
// has one. Ten seconds is far longer than a working provider ever needs.
const TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

// No tls.rejectUnauthorized:false. That accepted any certificate the host
// presented, which removes the protection against an intercepted connection -
// on the connection carrying password reset tokens. Every real provider serves
// a valid certificate, so the setting only ever hid a problem.
const transport = () =>
  nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    ...TIMEOUTS,
  });

const usingApi = () => Boolean(BREVO_API_KEY);

// Whether mail is configured at all. Checked at startup, so a deployment that
// cannot send says so on boot rather than the first time somebody is locked
// out of their account.
const isConfigured = () =>
  Boolean(MAIL_FROM) &&
  (usingApi() || Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD));

// One request to Brevo. Kept to the built-in fetch rather than adding a
// dependency for a single POST.
const callBrevo = async (path, options = {}) => {
  const response = await fetch(`https://api.brevo.com/v3${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    // Brevo answers with a JSON body naming the fault - an unverified sender,
    // a key that has been revoked. Worth surfacing rather than "400".
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Brevo API ${response.status}: ${detail.slice(0, 200) || response.statusText}`
    );
  }

  return response;
};

// Checks the credentials without sending anything.
//
// Called before the user is looked up, deliberately. The failures that actually
// happen - a rejected key, a blocked port, nothing configured - are true for
// every address, so answering them identically for every address is what stops
// this becoming a way to ask whether someone has an account here.
const verifyMailer = async () => {
  if (!isConfigured()) {
    throw new Error(
      !MAIL_FROM
        ? "MAIL_FROM is not set - it must be an address the provider has verified"
        : "Mail is not configured - set BREVO_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASSWORD"
    );
  }

  if (usingApi()) {
    // /account is a plain read that costs no send quota and fails loudly on a
    // bad key.
    await callBrevo("/account");
    return;
  }

  await transport().verify();
};

const describeMailer = () => {
  // Checked first, so a half-configured mailer does not describe itself as
  // working "as undefined".
  if (!MAIL_FROM) return "not configured - MAIL_FROM is missing";
  if (usingApi()) return `Brevo HTTP API as ${MAIL_FROM}`;
  if (SMTP_HOST && SMTP_USER) return `${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}`;
  return "not configured";
};

const sendMail = async (email, token, fName) => {
  const resetLink = `${APP_URL}/reset/${token}`;
  const template = `
        <!DOCTYPE html>
        <html>
        <head>

        <meta charset="utf-8">
        <meta http-equiv="x-ua-compatible" content="ie=edge">
        <title>Password Reset</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style type="text/css">
        /**
         * Google webfonts. Recommended to include the .woff version for cross-client compatibility.
         */
        @media screen {
            @font-face {
            font-family: 'Source Sans Pro';
            font-style: normal;
            font-weight: 400;
            src: local('Source Sans Pro Regular'), local('SourceSansPro-Regular'), url(https://fonts.gstatic.com/s/sourcesanspro/v10/ODelI1aHBYDBqgeIAH2zlBM0YzuT7MdOe03otPbuUS0.woff) format('woff');
            }

            @font-face {
            font-family: 'Source Sans Pro';
            font-style: normal;
            font-weight: 700;
            src: local('Source Sans Pro Bold'), local('SourceSansPro-Bold'), url(https://fonts.gstatic.com/s/sourcesanspro/v10/toadOcfmlt9b38dHJxOBGFkQc6VGVFSmCnC_l7QZG60.woff) format('woff');
            }
        }

        /**
         * Avoid browser level font resizing.
         * 1. Windows Mobile
         * 2. iOS / OSX
         */
        body,
        table,
        td,
        a {
            -ms-text-size-adjust: 100%; /* 1 */
            -webkit-text-size-adjust: 100%; /* 2 */
        }

        /**
         * Remove extra space added to tables and cells in Outlook.
         */
        table,
        td {
            mso-table-rspace: 0pt;
            mso-table-lspace: 0pt;
        }

        /**
         * Better fluid images in Internet Explorer.
         */
        img {
            -ms-interpolation-mode: bicubic;
        }

        /**
         * Remove blue links for iOS devices.
         */
        a[x-apple-data-detectors] {
            font-family: inherit !important;
            font-size: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
            color: inherit !important;
            text-decoration: none !important;
        }

        /**
         * Fix centering issues in Android 4.4.
         */
        div[style*="margin: 16px 0;"] {
            margin: 0 !important;
        }

        body {
            width: 100% !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        /**
         * Collapse table borders to avoid space between cells.
         */
        table {
            border-collapse: collapse !important;
        }

        a {
            color: #1a82e2;
        }

        img {
            height: auto;
            line-height: 100%;
            text-decoration: none;
            border: 0;
            outline: none;
        }
        </style>

        </head>
        <body style="background-color: #e9ecef;">

        <!-- start preheader -->
        <div class="preheader" style="display: none; max-width: 0; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
            Click the link to reset your Twin Tips Password
        </div>
        <!-- end preheader -->

        <!-- start body -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%">

            <!-- start logo -->
            <tr>
            <td align="center" bgcolor="#e9ecef">
                <!--[if (gte mso 9)|(IE)]>
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
                <tr>
                <td align="center" valign="top" width="600">
                <![endif]-->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
                <tr>
                    <td align="center" valign="top" style="padding: 36px 24px;">
                    <a href="${APP_URL}" target="_blank" style="display: inline-block;">
                        <img src="${
                          setup.logoLink
                        }" alt="Logo" border="0" width="48" style="display: block; width: 200px; max-width: 200px; min-width: 200px;">
                    </a>
                    </td>
                </tr>
                </table>
                <!--[if (gte mso 9)|(IE)]>
                </td>
                </tr>
                </table>
                <![endif]-->
            </td>
            </tr>
            <!-- end logo -->

            <!-- start hero -->
            <tr>
            <td align="center" bgcolor="#e9ecef">
                <!--[if (gte mso 9)|(IE)]>
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
                <tr>
                <td align="center" valign="top" width="600">
                <![endif]-->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
                <tr>
                    <td align="left" bgcolor="#ffffff" style="padding: 36px 24px 0; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; border-top: 3px solid #d4dadf;">
                    <h1 style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 48px;">Reset Your Password</h1>
                    </td>
                </tr>
                </table>
                <!--[if (gte mso 9)|(IE)]>
                </td>
                </tr>
                </table>
                <![endif]-->
            </td>
            </tr>
            <!-- end hero -->

            <!-- start copy block -->
            <tr>
            <td align="center" bgcolor="#e9ecef">
                <!--[if (gte mso 9)|(IE)]>
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
                <tr>
                <td align="center" valign="top" width="600">
                <![endif]-->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">

                <!-- start copy -->
                <tr>
                    <td align="left" bgcolor="#ffffff" style="padding: 24px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px;">
                    <p style="margin: 0;">Hi ${fName}, <br>Click the button below to reset your password. If you didn't request a new password, you can safely delete this email.</p>
                    </td>
                </tr>
                <!-- end copy -->

                <!-- start button -->
                <tr>
                    <td align="left" bgcolor="#ffffff">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                        <td align="center" bgcolor="#ffffff" style="padding: 12px;">
                            <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td align="center" bgcolor="#1a82e2" style="border-radius: 6px;">
                                <a href="${resetLink}" target="_blank" style="display: inline-block; padding: 16px 36px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 6px;">Reset Password</a>
                                </td>
                            </tr>
                            </table>
                        </td>
                        </tr>
                    </table>
                    </td>
                </tr>
                <!-- end button -->

                <!-- start copy -->
                <tr>
                    <td align="left" bgcolor="#ffffff" style="padding: 24px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px;">
                    <p style="margin: 0;">If that doesn't work, copy and paste the following link in your browser:</p>
                    <p style="margin: 0;"><a href="${resetLink}" target="_blank">${resetLink}</a></p>
                    </td>
                </tr>
                <!-- end copy -->

                <!-- start copy -->
                <tr>
                    <td align="left" bgcolor="#ffffff" style="padding: 24px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; border-bottom: 3px solid #d4dadf">
                    <p style="margin: 0;">Cheers,<br> Twin Tips</p>
                    </td>
                </tr>
                <!-- end copy -->

                </table>
                <!--[if (gte mso 9)|(IE)]>
                </td>
                </tr>
                </table>
                <![endif]-->
            </td>
            </tr>
            <!-- end copy block -->

            
                </table>
                <!--[if (gte mso 9)|(IE)]>
                </td>
                </tr>
                </table>
                <![endif]-->
            </td>
            </tr>
            <!-- end footer -->

        </table>
        <!-- end body -->

        </body>
        </html>
      `;

  // Throws rather than swallows.
  //
  // This used to catch its own error, log two lines and return normally - so
  // forgotPassword carried on to "a reset link is on its way" whether one had
  // been sent or not. The only trace was a console line on the server, which
  // on Render scrolls away unread. A season of members could be locked out of
  // their accounts with the app reporting success every time.
  //
  // A caller that wants to carry on regardless can catch this. Nothing may
  // decide on the caller's behalf that a failure did not matter.
  if (usingApi()) {
    const response = await callBrevo("/smtp/email", {
      method: "POST",
      body: JSON.stringify({
        sender: { name: setup.company, email: MAIL_FROM },
        to: [{ email }],
        subject: setup.forgotEmailSubject,
        htmlContent: template,
      }),
    });

    const { messageId } = await response.json().catch(() => ({}));
    console.log("Message sent:", messageId || "(accepted)");
    return { messageId };
  }

  const info = await transport().sendMail({
    from: `${setup.company} <${MAIL_FROM}>`,
    to: email,
    subject: setup.forgotEmailSubject,
    html: template,
  });

  console.log("Message sent:", info.messageId);
  return info;
};

module.exports = { sendMail, verifyMailer, isConfigured, describeMailer };
