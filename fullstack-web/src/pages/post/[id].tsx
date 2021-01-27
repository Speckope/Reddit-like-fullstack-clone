import { Box, Flex, Heading } from '@chakra-ui/react';
import { withUrqlClient } from 'next-urql';
import React from 'react';
import { EditDeletePostButtons } from '../../components/EditDeletePostButtons';
import { Layout } from '../../components/Layout';
import { createUrqlClient } from '../../utils/createUqrlClient';
import { useGetPostFromUrl } from '../../utils/useGetPostFromUrl';

const Post: React.FC = ({}) => {
  const [{ data, error, fetching }] = useGetPostFromUrl();

  // This is a nice approach, we write it insted of turnary in return below!
  if (fetching) {
    return (
      <Layout>
        <div>Loading...</div>
      </Layout>
    );
  }

  if (error) {
    return <div>{error.message}</div>;
  }

  if (!data?.post) {
    return (
      <Layout>
        <Box>Could not find a post</Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <Flex justifyContent='space-between'>
        <Box>
          <Heading mb={4}>{data.post.title}</Heading>
          <Box> {data.post.text} </Box>
        </Box>
        <EditDeletePostButtons
          id={data.post.id}
          creatorId={data.post.creator.id}
        />
      </Flex>
    </Layout>
  );
};

// We add ssr bc we want post pages to have good SEO
export default withUrqlClient(createUrqlClient, { ssr: true })(Post);
