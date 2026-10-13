/**
 * Contrato del webhook de Polar. Dos propiedades, las dos silenciosas si se
 * rompen: nadie ve un error, simplemente alguien paga y no recibe su rol.
 *
 *   1. FIRMA — se aceptan las derivaciones de clave que Polar puede usar, y un
 *      secreto distinto se rechaza SIEMPRE.
 *   2. FORMA — el evento parseado expone los campos con los nombres que lee
 *      `handlePolarWebhook`.
 *
 * El secreto de produccion tiene el prefijo **`polar_whs_`**, no `whsec_`, y eso
 * cambia el resultado: con `whsec_` el SDK 1.x prueba las dos derivaciones, con
 * `polar_whs_` solo prueba una. Por eso los casos de abajo usan el prefijo real.
 *
 * Medido comparando 0.49 + wrapper contra 1.x sola:
 *
 *   firma generada con      | 0.49 + wrapper | 1.x
 *   base64(cuerpo)          | RECHAZA        | RECHAZA
 *   utf8(secreto completo)  | acepta         | acepta
 *   base64(secreto completo)| acepta (*)     | RECHAZA
 *   secreto distinto        | RECHAZA        | RECHAZA
 *
 * (*) solo pasandole un Buffer a validateEvent, que la 1.x rechaza con
 * TypeError. No es un formato de Polar: era un artefacto del wrapper viejo.
 *
 * Correr: npm test   (desde functions/)
 */
const crypto = require('crypto')
const assert = require('node:assert')

// Mismo formato que el secreto real: `polar_whs_` + 43 chars base64.
const SECRET_BODY = crypto.randomBytes(32).toString('base64').replace(/=+$/, '')
const SECRET = `polar_whs_${SECRET_BODY}`
const WRONG_SECRET = `polar_whs_${crypto.randomBytes(32).toString('base64').replace(/=+$/, '')}`

const PAYLOAD = JSON.stringify({
    type: 'subscription.created',
    data: {
        id: 'sub_test',
        status: 'active',
        product_id: 'prod_test',
        current_period_end: '2027-01-01T00:00:00Z',
        customer: { id: 'cus_test', email: 'test@example.com' },
        metadata: { user_id: 'uid_test' },
    },
})

const ORDER_PAID_PAYLOAD = JSON.stringify({
    type: 'order.paid',
    data: {
        id: 'ord_test',
        status: 'paid',
        product_id: 'prod_test',
        total_amount: 2900,
        currency: 'usd',
        customer: { id: 'cus_test', email: 'test@example.com' },
        metadata: { user_id: 'uid_test' },
    },
})

// Las derivaciones de clave con las que Polar podria estar firmando.
// Con un secreto `polar_whs_` el SDK deriva la clave como el UTF-8 del string
// completo. La 0.49 ademas aceptaba base64(secreto completo), pero solo si se le
// pasaba un Buffer, cosa que la 1.x rechaza con TypeError: no es un formato de
// Polar, era un artefacto del wrapper viejo.
const KEYS = {
    'utf8(secreto completo)': Buffer.from(SECRET, 'utf8'),
}

const sign = (key, payload, id) => {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = crypto
        .createHmac('sha256', key)
        .update(`${id}.${timestamp}.${payload}`)
        .digest('base64')
    return {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`,
    }
}

const { webhooks } = require('@polar-sh/sdk/2026-10')

// Misma logica que `validatePolarEvent` en index.js. Si cambia alla, cambia aca.
const validatePolarEvent = async (rawBody, headers, secret) =>
    webhooks.validateEvent(rawBody, headers, secret)

const attempt = async (payload, key, secret) => {
    const id = 'msg_' + crypto.randomBytes(6).toString('hex')
    try {
        return { ok: true, event: await validatePolarEvent(Buffer.from(payload), sign(key, payload, id), secret) }
    } catch (error) {
        if (error instanceof webhooks.PolarWebhookVerificationError) return { rejected: true }
        return { parseError: error }
    }
}

const run = async () => {
    let failures = 0
    const check = (name, fn) => {
        try {
            fn()
            console.log(`  ok   ${name}`)
        } catch (error) {
            console.error(`  FAIL ${name}\n       ${error.message}`)
            failures += 1
        }
    }

    // --- FIRMA ---------------------------------------------------------------
    for (const [label, key] of Object.entries(KEYS)) {
        const good = await attempt(PAYLOAD, key, SECRET)
        check(`acepta una firma hecha con ${label}`, () =>
            assert.notStrictEqual(good.rejected, true,
                'esta derivacion dejo de verificar: una entrega real daria 403 y el cliente pagaria sin recibir su rol'))

        // Lo no negociable: con otro secreto, ninguna derivacion puede pasar.
        const bad = await attempt(PAYLOAD, key, WRONG_SECRET)
        check(`RECHAZA esa misma firma con un secreto distinto (${label})`, () =>
            assert.strictEqual(bad.rejected, true,
                'el endpoint estaria aceptando eventos de cualquiera'))
    }

    // --- FORMA ---------------------------------------------------------------
    const sub = await attempt(PAYLOAD, KEYS['utf8(secreto completo)'], SECRET)
    check('subscription.created expone los campos que lee el handler', () => {
        assert.ok(sub.event, `no parseo: ${sub.parseError?.message?.slice(0, 120)}`)
        for (const field of ['id', 'status', 'product_id', 'current_period_end']) {
            assert.ok(field in sub.event.data, `falta data.${field} - el handler lo lee`)
        }
        assert.strictEqual(sub.event.data.metadata.user_id, 'uid_test', 'asi se resuelve el usuario')
        assert.strictEqual(sub.event.data.customer.id, 'cus_test')
    })

    check('current_period_end es parseable a Date', () => {
        // El handler lo envuelve en new Date() antes de guardarlo, porque la 0.49
        // devolvia Date y Firestore guardaba Timestamp.
        const parsed = new Date(sub.event.data.current_period_end)
        assert.ok(!Number.isNaN(parsed.getTime()), 'no se puede convertir a Date')
    })

    const order = await attempt(ORDER_PAID_PAYLOAD, KEYS['utf8(secreto completo)'], SECRET)
    check('order.paid expone los campos que lee el handler', () => {
        assert.ok(order.event, `no parseo: ${order.parseError?.message?.slice(0, 120)}`)
        assert.strictEqual(order.event.data.metadata.user_id, 'uid_test', 'sin esto el pago se ignora')
        assert.strictEqual(order.event.data.status, 'paid')
        for (const field of ['id', 'product_id', 'total_amount', 'currency']) {
            assert.ok(field in order.event.data, `falta data.${field} - el handler lo lee`)
        }
    })

    // --- COBERTURA POR TIPO DE EVENTO ---------------------------------------
    // El handler tiene una rama por cada uno de estos. Si un bump de version
    // deja de parsear alguno, esa rama deja de ejecutarse y el pago se pierde
    // en silencio (el endpoint igual responde 200).
    const mkSub = (type) => JSON.stringify({ type, data: { id: 'sub_1', status: 'active', product_id: 'prod_1', current_period_end: '2027-01-01T00:00:00Z', customer: { id: 'cus_1', email: 'a@b.c' }, metadata: { user_id: 'u1' } } })
    const mkOrd = (type, status) => JSON.stringify({ type, data: { id: 'ord_1', status, product_id: 'prod_1', total_amount: 2900, amount: 2900, currency: 'usd', customer: { id: 'cus_1', email: 'a@b.c' }, metadata: { user_id: 'u1' } } })
    const mkChk = (type) => JSON.stringify({ type, data: { id: 'chk_1', status: 'open', product_id: 'prod_1', customer: { id: 'cus_1' }, metadata: { user_id: 'u1' } } })

    const TIPOS = [
        mkSub('subscription.created'), mkSub('subscription.updated'), mkSub('subscription.active'),
        mkSub('subscription.canceled'), mkSub('subscription.revoked'),
        mkOrd('order.created', 'pending'), mkOrd('order.paid', 'paid'),
        mkOrd('order.updated', 'paid'), mkOrd('order.refunded', 'refunded'),
        mkChk('checkout.created'), mkChk('checkout.updated'),
    ]

    for (const payload of TIPOS) {
        const tipo = JSON.parse(payload).type
        const r = await attempt(payload, KEYS['utf8(secreto completo)'], SECRET)
        check(`parsea ${tipo}`, () => {
            assert.ok(r.event, `no parseo: ${r.parseError?.message?.slice(0, 100)}`)
            assert.strictEqual(r.event.type, tipo)
        })
    }

    if (failures > 0) {
        console.error(`\n${failures} fallo(s)`)
        process.exit(1)
    }
    console.log('\ntodo ok')
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
