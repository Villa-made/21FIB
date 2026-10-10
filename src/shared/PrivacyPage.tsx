import { PageTitle, Card } from './ui';

// Texto mínimo de COM-08 / ID-06. PENDIENTE: el equipo debe fijar responsable y contacto reales antes del GO.
export default function PrivacyPage() {
  return (
    <>
      <PageTitle title="Privacidad y retirada de contenido" />
      <Card className="space-y-3 text-sm leading-relaxed text-stone-700">
        <p><strong>Qué publicamos.</strong> Si la validación aprueba tu acción, se publican tu alias, la foto (sin metadatos de ubicación), la descripción, el tipo de acción y el municipio. Tu email nunca se muestra.</p>
        <p><strong>Validación con IA.</strong> Las fotos se envían a un servicio de IA para comprobar que son coherentes con la acción. Es una estimación razonable, no una certificación.</p>
        <p><strong>Fotos de otras personas.</strong> No subas fotos en las que se reconozca a terceros o matrículas sin su permiso.</p>
        <p><strong>Cuenta.</strong> El email no se verifica y no hay recuperación de contraseña por correo durante la beta.</p>
        <p><strong>Retirada y supresión.</strong> Puedes ocultar tus publicaciones en cualquier momento (pierdes sus puntos). Para pedir la retirada de contenido o la supresión de tus datos escribe a <span className="font-mono">[CONTACTO PENDIENTE]</span>. Cualquier persona puede denunciar una publicación desde el feed.</p>
      </Card>
    </>
  );
}
