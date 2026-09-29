import { Sources } from './PanneauCarte'

export function PanneauCompte() {
  return (
    <>
      <p>La connexion (Google ou e-mail et mot de passe) arrive bientôt. Elle permettra de :</p>
      <ul className="liste">
        <li>retrouver ton profil de financement et tes filtres sur tous tes appareils ;</li>
        <li>afficher les ventes individuelles des 24 derniers mois sur la carte.</li>
      </ul>
      <p className="note">En attendant, ton profil de financement est enregistré sur cet appareil, et les filtres sont
        dans l'adresse de la page : copie-la pour la retrouver ou la partager.</p>
      <h3>Sources et méthode</h3>
      <Sources />
      <p className="note">Outil personnel, estimations indicatives. Données ouvertes : DVF (DGFiP / Etalab), IDFM, INSEE,
        IGN, ANCT, ministère du Logement.</p>
    </>
  )
}
