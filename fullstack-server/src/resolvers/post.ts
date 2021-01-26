// import { isAuth } from '../middleware/isAuth';
import { MyContext } from 'src/types';
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from 'type-graphql';
import { Post } from '../entities/Post';
import { getConnection } from 'typeorm';
import { isAuth } from '../middleware/isAuth';
import { Updoot } from '../entities/Updoot';

@InputType()
class PostInput {
  @Field()
  title: string;
  @Field()
  text: string;
}

@ObjectType()
class PaginatedPosts {
  // [Post] is a graphql type, Post[] is a TS type!!
  @Field(() => [Post])
  posts: Post[];
  // This wil return whether there are more posts in the list
  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  // When we do this kind od FieldResolver, we have to ad to @Resolver() what we are resolving
  // Here - Post @Resolver(Post)
  // @FieldResolver is a graplq thing
  // We are going to create this field and send it to the client.
  @FieldResolver(() => String)
  // This function is going to get called everytime we request send Post
  // Root is a Post
  // Now on our frontent insted of a text, we request textSnippet.
  // This way we fetch only small part of the text, we will fetch whole text only when we click on the post!
  textSnippet(@Root() root: Post) {
    return root.text.slice(0, 50);
  }

  // UPDOOT MUTATION
  @Mutation(() => Boolean)
  // Only loggen in users can vote
  @UseMiddleware(isAuth)
  async vote(
    @Arg('postId', () => Int) postId: number,
    @Arg('value', () => Int) value: number,
    @Ctx() { req }: MyContext
  ) {
    // It's an updoot if it's not -1
    // We do it to prevent situations when user gives it like 13 points(in his request)
    const isUpdoot = value !== -1;
    // This means if they pass less than -1 point, we give a post an updoot anyway
    const realValue = isUpdoot ? 1 : -1;
    const { userId } = req.session;
    // So we look for the post that has both selected postId and UserId
    // It will mean that user has already voted
    const updoot = await Updoot.findOne({ where: { postId, userId } });

    // If updoot.value !== realValue it means user is changing from updoot to downdoot or other direction
    // If user has voted on the psot before and is changing his vote
    if (updoot && updoot.value !== realValue) {
      await getConnection().transaction(async (tm) => {
        // We update the value of an updoot where postId = passed PostId and userID = passedUserId
        // So we use unique combination of these two ids to find specific post!
        await tm.query(
          `
        update updoot set value = $1
        where "postId" = $2 and "userId" = $3
        `,
          [realValue, postId, userId]
        );

        // And we update points of the post
        await tm.query(
          `
        update post 
        set points = points + $1
        where id = $2;
        `,
          // 2* realValue bc then we change from 1 to -1 its -2 and from -1 to 1 its 2
          [2 * realValue, postId]
        );
      });

      // User has not voted before
    } else if (!updoot) {
      // We construct our transaction
      // This way when it fails, it will fail altogether
      // Also Typeorm will handle opening and closing a transaction
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `
        insert into updoot ("userId", "postId", value)
      values ($1, $2, $3);
        `,
          [userId, postId, realValue]
        );

        await tm.query(
          `
        update post 
        set points = points + $1
        where id = $2;
        `,
          [realValue, postId]
        );
      });
    } else {
    }

    // await Updoot.insert({
    //   userId,
    //   postId,
    //   value,
    // });

    // await getConnection().query(
    //   `
    //   START TRANSACTION;
    //   insert into updoot ("userId", "postId", value)
    //   values (${userId}, ${postId}, ${realValue});
    //   update post
    //   set points = points + ${realValue}
    //   where id = ${postId};
    //   COMMIT;
    // `
    // );

    return true;
  }

  // Find all posts
  @Query(() => PaginatedPosts)
  async posts(
    @Arg('limit', () => Int) limit: number,
    // We could set offset, it's easy, but with offset we can run into performance problems
    // especially if there are frequent updates
    // Therefore we will use cursor based pagination
    // @Arg('offset') offset: number
    // With offset we say "give me gave after 10th post"
    // With cursor we give it location, which means 'give me every post after specified location
    // Type of cursor will depend of how we want to sort posts
    @Arg('cursor', () => String, { nullable: true }) cursor: string | null // This is going to be a date, bc we will sort by the newest
  ): Promise<PaginatedPosts> {
    // !!  Notice that this TS type is the same as what we return in Query!
    // We will let user pass whatever limit he wants, but under 50
    // User asks for 20 losts, but actually we fetch 21 posts.
    // Idea is we check for the number of posts we git back. If we get 21 posts it means there
    // are more posts to be shown. If we get less, we know that there is not more to be shown
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;

    // const qb = getConnection()
    //     .getRepository(Post)
    //     // this is alias of how we wantn to call it
    //     .createQueryBuilder('p')
    //     .where('"createdAt" > :cursor', { cursor: parseInt(cursor); })
    //     // We need double quotes around specific words in postresql,
    //     // bc when it runs a sequel it lowercases it. Quotes will prevent it
    //     .orderBy('"createdAt"', 'DESC') // order by createdAt and descending
    //     .take(realLimit) // .take is recommended instead of .limit if we are doing pagination
    //     .getMany()

    const replacements: any[] = [realLimitPlusOne];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
    }

    // This way we can write raw sql!
    // We write here: I want to reference the post table and i want to select all fields in it
    const posts = await getConnection().query(
      `
      select p.*,
      json_build_object(
        'id', u.id,
        'username', u.username,
        'email', u.email,
        'createdAt', u."createdAt",
        'updatedAt', u."updatedAt"
    ) creator
    from post p
    inner join public.user u on u.id = p."creatorId"
    ${cursor ? `where p."createdAt" < $2` : ''}
    order by p."createdAt" DESC
    limit $1
    `,
      // We pass replacements of $1 and $2.
      replacements
    );

    // We construct our query conditionally!
    // const qb = getConnection()
    // .getRepository(Post)
    //   // this is alias of how we wantn to call it
    //   .createQueryBuilder('p')
    //   .innerJoinAndSelect(
    //     // Which field we want to join on
    //     'p.creator',
    //     // Alias, here u for user
    //     'u',
    //     // Condition on which fields will be joined
    //     '"u.id = p.creatorId"'
    //   )
    //   // We need double quotes around specific words in postresql,
    //   // bc when it runs a sequel it lowercases it. Quotes will prevent it
    //   .orderBy('p."createdAt"', 'DESC') // order by createdAt and descending
    //   .take(realLimitPlusOne); // .take is recommended instead of .limit if we are doing pagination

    // if (cursor) {
    //   // cursor: new Date works for timestamp!
    //   qb.where('p."createdAt" < :cursor', {
    //     cursor: new Date(parseInt(cursor)),
    //   });
    // }

    // const posts = await qb.getMany();

    // So we fetch one  more post, then check if this one more post is present by comparing length of
    // fetched posts to realLimitPlusOne(how much we wanted to fetch).
    // If number of posts we fetched is not equal, it means there is no more posts.
    // And we give the user one less post, se if hasMore is true, he will be able to fetch more posts
    // even if there is only one more post to be fetched!
    // Nice.
    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  // Find one post by id
  @Query(() => Post, { nullable: true }) // { nullable: true } is how we say it can return null
  //Inside a function we pass arguments we give it!
  post(
    // In GraphQl we mark agruments like with @Arg
    @Arg('id', () => Int) id: number //  () => Int says it's an integer. However, both strings and int can be ommited. GraphQL will know this from TS type
  ): // This is what we're going to return. Whole thing is f(): Promise<Post | null> {}. It may be hard to see at first!
  Promise<Post | undefined> {
    return Post.findOne(id);
  }

  // Create a post!
  // Queries are for getting data, mutations for updating/inserting/deleting
  @Mutation(() => Post) // { nullable: true } is how we say it can return null
  @UseMiddleware(isAuth)
  async createPost(
    @Arg('input') input: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post> {
    // We spread input!
    return Post.create({ ...input, creatorId: req.session.userId }).save();
  }

  // UPDATE POST. This is example with 2 SQL queries!!
  @Mutation(() => Post, { nullable: true }) // { nullable: true } is how we say it can return null
  async updatePost(
    // To have 2 more arguments just add like this
    @Arg('id') id: number,
    @Arg('title', () => String, { nullable: true }) title: string // When nullable we have to declare type in 2nd argument
  ): Promise<Post | null> {
    const post = await Post.findOne(id); // Same as await Post.findOne({where: {id}});
    // If post is not found return null!
    if (!post) {
      return null;
    }
    // If we were given title, we update it!
    if (typeof title !== 'undefined') {
      // Update the post with given id to the value title
      await Post.update({ id }, { title });
    }
    return post;
  }

  // DELETE POST
  @Mutation(() => Boolean) // We return boolean whether it worked or not
  async deletePost(@Arg('id') id: number): Promise<Boolean> {
    await Post.delete(id);
    return true;
  }
}
