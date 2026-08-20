# Règles de validité — contraintes de véracité du billet

> **Fichier invariant.** Ces règles ne décrivent aucun style et ne dépendent d'aucun
> lieu : elles définissent ce que le billet a le droit d'affirmer. Elles valent
> pour toute instance de l'almanach et descendent telles quelles dans un dépôt
> cloné — c'est le fichier qui empêche un almanach d'écrire joliment des faussetés.
>
> Le ton, lui, vit dans `prompts/editorial-voice.md` et appartient à chaque instance.
>
> **Chargé à l'exécution** par l'étape de synthèse (§7 du spec) à chaque génération,
> avant le fichier de voix. Modifier *ce fichier*, pas le code.

---

## Règle d'or — exactitude (priorité absolue)

- Le billet ne s'appuie **que** sur les données réelles du jour fournies en entrée (observations, météo, éphémérides).
- **Ne jamais inventer** une espèce, un chiffre, une heure, une condition météo ou un événement astronomique. Si une donnée manque, ne pas la mentionner : le silence vaut mieux que l'invention.
- **Aucun décor inventé.** Le lieu se nomme avec ce qui est attesté, jamais avec un détail fabriqué pour faire vrai. Interdit : un élément de terrain précis et défini qui n'apparaît dans aucune donnée — « le bouleau mort près du pont », « la vieille souche du sentier », « la mangeoire ». Ces choses n'existent pas dans les sources ; les nommer, c'est mentir joliment. Si un support physique est nécessaire à la phrase, rester **indéfini et générique** : « un arbre mort », « le sous-bois », « la litière ».
- **En revanche, l'histoire naturelle est permise.** Les mœurs connues d'une espèce attestée ce jour-là s'extrapolent librement : ce qu'elle mange, comment elle cherche, où elle niche, comment elle se déplace. « Le pic cherchait des larves dans un arbre mort » est légitime — c'est du savoir sur l'espèce. « Le pic cherchait des larves dans le bouleau mort près du pont » ne l'est pas — c'est une affirmation sur *ce lieu-ci*. La ligne passe entre le comportement typique (permis) et le fait particulier (exige une donnée).
- **Aucune espèce hors liste.** Ne nommer que les espèces effectivement présentes dans les données du jour, avec leur nom exact. Ne jamais compléter une liste jugée courte, ni substituer une espèce voisine plus sonore : une grive solitaire n'est pas une grive des bois.
- **Aucune durée sans champ.** Le billet décrit *une journée*. Dès qu'une phrase porte sur une période plus longue — « depuis trois jours », « depuis une semaine », « la semaine a été sèche » —, elle doit venir d'un champ fourni dans `derived` et rien d'autre. Une absence de pluie *ce jour-là* ne dit rien de la veille : c'est une mesure, pas une tendance. Une durée vraie pour un phénomène (les éclairs) n'est jamais transposable à un autre (la pluie). Si le champ manque ou vaut `null`, ne rien écrire sur la durée — décrire la journée seule suffit.
- **Aucune citation dans le billet.** Les citations viennent uniquement de la section *Fragment* (table `ref_quotes`). Ne jamais attribuer une phrase à un auteur.
- La voix règle le **comment**, jamais le **quoi**. On embellit le style, jamais les faits.

---

*Fichier invariant : à reconduire tel quel dans toute instance dérivée. Les modifications de ton se font dans `prompts/editorial-voice.md`.*
