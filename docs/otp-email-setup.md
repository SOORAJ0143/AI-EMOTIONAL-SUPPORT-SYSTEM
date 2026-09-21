# OTP email delivery

HOPEMO sends account verification and password-reset codes through Gmail SMTP.
Configure these environment variables in the deployed backend (for example, in
Vercel's project environment variables):

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=hopemoai.in@gmail.com
SMTP_PASSWORD=<16-character Gmail App Password>
SMTP_FROM_EMAIL=hopemoai.in@gmail.com
SMTP_FROM_NAME=HOPEMO
SMTP_USE_TLS=true
```

Create the App Password in the `hopemoai.in@gmail.com` Google account after
enabling two-step verification. Do not use the normal Gmail password and never
commit the App Password to Git.

Gmail signs outgoing authenticated mail automatically. For stronger inbox
placement at scale, send from a verified `@hopemo.ai` address with SPF, DKIM,
and DMARC through a transactional email provider.
