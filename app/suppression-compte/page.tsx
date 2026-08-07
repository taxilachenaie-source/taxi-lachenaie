export default function SuppressionComptePage() {
  return (
    <main className="min-h-screen bg-white px-6 py-16 text-gray-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold">
          Suppression de compte
        </h1>

        <p className="mb-6 text-lg">
          Les utilisateurs de l&apos;application Taxi Lachenaie Chauffeur
          peuvent demander la suppression de leur compte et des données
          personnelles associées.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          Comment demander la suppression
        </h2>

        <p className="mb-4">
          Envoyez un courriel à :
        </p>

        <p className="mb-6 font-semibold">
          taxilachenaie@gmail.com
        </p>

        <p className="mb-4">
          Utilisez comme objet :
        </p>

        <p className="mb-6 font-semibold">
          Demande de suppression de compte
        </p>

        <p className="mb-6">
          Veuillez indiquer l&apos;adresse courriel ou le numéro de téléphone
          associé à votre compte afin que nous puissions identifier votre
          compte.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          Données supprimées
        </h2>

        <p className="mb-6">
          Après vérification de la demande, nous supprimerons le compte et les
          renseignements personnels associés, sauf les données que nous devons
          conserver lorsque la loi l&apos;exige.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          Délai de traitement
        </h2>

        <p>
          Les demandes de suppression sont traitées dans un délai maximal de
          30 jours.
        </p>
      </div>
    </main>
  );
}