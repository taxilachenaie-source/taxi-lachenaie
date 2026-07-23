export default function Pricing() {
  return (
    <section className="bg-white text-black px-8 py-20">
      <h2 className="text-4xl font-bold text-center mb-12">Nos tarifs</h2>

      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div className="border rounded-3xl p-8 shadow-lg">
          <h3 className="text-3xl font-bold">Standard</h3>
          <p className="text-5xl font-bold mt-6">5,25 $</p>
          <p className="mt-4">2,05 $ / km</p>
          <p>0,65 $ / minute</p>
        </div>

        <div className="border-2 border-yellow-400 rounded-3xl p-8 shadow-lg">
          <h3 className="text-3xl font-bold">VIP</h3>
          <p className="text-5xl font-bold mt-6">10,00 $</p>
          <p className="mt-4">3,25 $ / km</p>
          <p>Service premium</p>
        </div>
      </div>
    </section>
  );
}