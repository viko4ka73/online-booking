import AppLink from "../components/AppLink";
import { FiArrowRight } from "react-icons/fi";
import PageHeading from "../components/PageHeading";
export default function AboutPage() {
  return <>
    <PageHeading eyebrow="Спортивный комплекс" title="О центре" description="Залы, инвентарь и всё, что пригодится перед первой игрой." />
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-12 lg:px-16">
          <section className="grid overflow-hidden rounded-[32px] bg-[#203126] text-[#fcfaf4] md:grid-cols-[1fr_1.15fr]">
            <div className="flex flex-col items-start justify-center p-7 sm:p-10 lg:p-14">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c5cea5]">Санкт-Петербург · Приморский район</p>
              <h2 className="mt-4 max-w-lg font-serif text-4xl leading-tight lg:text-5xl">Место для вашей следующей игры</h2>
              <p className="mt-4 max-w-lg leading-relaxed text-white/80">
                В комплексе «Играем?» можно сыграть партию после работы, собрать друзей на волейбол или провести регулярную тренировку. Площадки крытые, поэтому игра состоится в любую погоду.
              </p>
              <AppLink href="/courts" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#d9dfbf] px-5 py-3 text-sm font-semibold text-[#203126]! transition hover:bg-[#eef1dd]">
                Посмотреть площадки <FiArrowRight aria-hidden="true" />
              </AppLink>
            </div>
            <figure className="relative min-h-[250px] md:min-h-[380px]">
              <img src="/images/home/hero.png" alt="Крытый спортивный зал с сетками для бадминтона" className="absolute inset-0 h-full w-full object-cover" />
              <figcaption className="absolute bottom-4 left-4 rounded-full bg-[#203126] px-4 py-2 text-xs font-medium text-white sm:bottom-6 sm:left-6">Крытые залы · круглый год</figcaption>
            </figure>
          </section>

          <section aria-labelledby="center-facilities" className="mt-10">
            <h2 id="center-facilities" className="font-serif text-3xl">Что ждёт вас в центре</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {[
                { title: "Раздевалки и душевые", description: "Оставьте вещи в шкафчике на время игры. Ключ выдаёт администратор при входе." },
                { title: "Инвентарь на стойке", description: "Ракетки, воланы и мячи можно взять на месте. Если привыкли к своей ракетке, приносите её с собой." },
                { title: "Зона ожидания", description: "У входа в залы есть скамейки и кулер. Здесь удобно дождаться друзей или передохнуть после матча." },
              ].map(({ title, description }, index) => (
                <article key={title} className="rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-6">
                  <span aria-hidden="true" className="inline-flex size-11 items-center justify-center rounded-full bg-[#e8eddf] text-sm font-semibold text-[#405640]">0{index + 1}</span>
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#536354]">{description}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="mt-8 grid gap-5 rounded-3xl bg-[#e8eddf] p-7 sm:p-10 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="font-serif text-3xl">Первый визит</h2>
              <p className="mt-2 text-sm text-[#536354]">Три простых шага перед игрой</p>
            </div>
            <ol className="list-decimal space-y-3 pl-5 leading-relaxed marker:font-semibold">
              <li>Возьмите сменные кроссовки со светлой подошвой и бутылку для воды.</li>
              <li>Приходите за 10–15 минут. Назовите администратору имя и время игры.</li>
              <li>Переоденьтесь, заберите инвентарь и зайдите в зал к началу своего времени.</li>
            </ol>
          </section>
        </main>
  </>;
}
