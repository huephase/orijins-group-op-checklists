import type { FastifyInstance } from 'fastify';
import { formEditors, formReaders } from '../rbac/roles.js';
import { requireRole } from '../rbac/requireRole.js';
import { formatDisplayTime } from '../utils/time.js';
import { getFormDefinition, formRegistry } from './registry.js';
import { createPayloadSchema, submissionEnvelopeSchema } from './schemas.js';
import { submitForm } from './form.service.js';

export async function formRoutes(app: FastifyInstance): Promise<void> {
  app.get('/forms', { preHandler: requireRole(...formReaders) }, async (request, reply) =>
    reply.view('forms/list.njk', {
      title: 'Forms',
      forms: Object.values(formRegistry),
      user: request.currentUser,
    }),
  );
  app.get<{ Params: { formKey: string } }>(
    '/forms/:formKey/new',
    { preHandler: requireRole(...formEditors) },
    async (request, reply) => {
      const form = getFormDefinition(request.params.formKey);
      if (!form)
        return reply.code(404).view('errors/message.njk', {
          title: 'Form not found',
          message: 'That form does not exist.',
        });
      return reply.view('forms/new.njk', { title: form.title, form, user: request.currentUser });
    },
  );
  app.post<{ Params: { formKey: string } }>(
    '/api/forms/:formKey/submit',
    { preHandler: requireRole(...formEditors) },
    async (request, reply) => {
      const definition = getFormDefinition(request.params.formKey);
      if (!definition) return reply.code(404).send({ error: 'Form not found' });
      const envelope = submissionEnvelopeSchema.safeParse(request.body);
      if (!envelope.success)
        return reply
          .code(400)
          .send({ error: 'Invalid submission', details: envelope.error.flatten() });
      if (envelope.data.formVersion !== definition.version)
        return reply.code(409).send({ error: 'The form has changed; refresh before submitting.' });
      const values = createPayloadSchema(definition).safeParse(envelope.data.values);
      if (!values.success)
        return reply
          .code(422)
          .send({ error: 'Check the highlighted fields.', details: values.error.flatten() });
      if (
        definition.requiresGps &&
        !envelope.data.gps &&
        (definition.gpsFailureMode === 'block' || !envelope.data.gpsUnavailableReason)
      )
        return reply.code(422).send({ error: 'Location or a reason for its absence is required.' });
      const submission = await submitForm({
        tenantId: request.tenant.id,
        userId: request.currentUser!.id,
        definition,
        idempotencyKey: envelope.data.idempotencyKey,
        values: values.data,
        gps: envelope.data.gps,
        gpsUnavailableReason: envelope.data.gpsUnavailableReason,
        device: envelope.data.device,
      });
      return reply.code(201).send({
        id: submission.id,
        state: submission.state,
        submittedAt: submission.submittedAt?.toISOString(),
        displayTime: formatDisplayTime(submission.submittedAt ?? submission.createdAt),
      });
    },
  );
}
